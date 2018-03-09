

const Http = require('http');
const Https = require('https');
const Request = require('request');
const Fs = require('fs');
const BasicAuth = require('basic-auth');
const Crypto = require("crypto");

let config = process.argv[2];
if (!config) config = "./proxy.json";
console.log("Config file", config);



const Config = JSON.parse(Fs.readFileSync(config, 'utf8'));

const Auth = Config.auth ? Config.auth : [];


console.log("Config", Config);

/**
 * https://gist.github.com/bpedro/742162
 * Offers functionality similar to mkdir -p
 *
 * Asynchronous operation. No arguments other than a possible exception
 * are given to the completion callback.
 */
function mkdir_p(path, mode, callback, position) {
    // console.log("mkdir -p", path);
    mode = mode || 0777;
    position = position || 0;
    parts = require('path').normalize(path).split('/');
    let is_abs = path.startsWith("/");

    if (position >= parts.length) {
        if (callback) {
            return callback();
        } else {
            return true;
        }
    }

    let directory = parts.slice(0, position + 1).join('/');
    if (is_abs) directory = "/" + directory;
    Fs.stat(directory, function (err) {
        if (err === null) {
            mkdir_p(path, mode, callback, position + 1);
        } else {
            Fs.mkdir(directory, mode, function (err) {
                if (err) {
                    if (callback) {
                        return callback(err);
                    } else {
                        throw err;
                    }
                } else {
                    mkdir_p(path, mode, callback, position + 1);
                }
            })
        }
    })
}

let Queue = [];
function loopQueue() {
    let i = Queue.length;
    while (i--) {
        if (Queue[i]()) {
            Queue.splice(i, 1);
        }
    }
}
setInterval(loopQueue, 1000 / 10);

let Path = {
    lock: function (path) {
        // console.log("Lock", path);
        Fs.writeFile(path + ".lock", "1", function () { });
    },

    unlock: function (path) {
        // console.log("Unock", path);

        Fs.unlink(path + ".lock", function () { });
    },
    isLocked: function (path) {
        return Fs.existsSync(path + ".lock");
    },
    lockForDownload: function (path) {
        console.log("Download Lock", path);

        Fs.writeFile(path + ".dl", "1", function () { });

    },
    unlockForDownload: function (path) {
        console.log("Download Unlock", path);
        Fs.unlink(path + ".dl", function () { });
    },
    isLockedForDownload: function (path) {
        return Fs.existsSync(path + ".dl");

    }

}

function downloadToCache(path, resp) {

    // Lock path
    Path.lock(Config.cache_dir + "/" + path);

    // Check if artifact exists at given url
    // calls callback(true) if found
    let tryurl = function (url, callback) {
        let req = Request(url)
            .on('response', function (response) {
                if (response.statusCode === 200) {
                    console.log(path, "Found in", url);
                    let outfs = Fs.createWriteStream(Config.cache_dir + "/" + path);
                    req.pipe(outfs)
                        .on('finish', function () {
                            callback(true);
                            Path.unlock(Config.cache_dir + "/" + path); // Everything has been written, unlock path
                            getFromCache(path, resp, true); // Retrieve downloaded artifact
                        }).on("error", function (error) {
                            console.error("Error", error);
                            outfs.close();
                            callback(false);
                        });
                } else {
                    // console.log("Not found in", url);
                    callback(false);
                    // console.log(response.statusCode);
                }
            })


    };

    // Recursive function that loops every repo until artifact is found (found=true)
    let failed = true;
    let repo_i = 0;
    let looprepos = function (found) {
        if (found) {
            console.log("Artifact found");
            failed = false;
            return;
        }
        if (repo_i >= Config.repos.length) {
            if (failed) {
                if (failed) {
                    Path.unlock(Config.cache_dir + "/" + path);
                    resp.writeHead(404, { "Content-Type": "text/plain" });
                    resp.write("404 Not Found\n");
                    resp.end();
                }
            }
            return;
        }
        // Build url from repo+path
        let url = Config.repos[repo_i];
        url += path;
        console.log("Try", url);
        tryurl(url, looprepos);
        // Go to the next repo
        repo_i++;
    };

    // Start repo loop
    looprepos(false);


}

function listDirectory(cache_path, resp) {
    Fs.readdir(cache_path, function (err, files) {
        if (err) {
            console.error(err);
            resp.writeHead(500, { "Content-Type": "text/plain" });
            resp.write("500 Server Error\n");
            resp.end();
        } else {
            resp.writeHead(200, { "Content-Type": "text/html" });
            resp.write("<h1>Maven Proxy</h1><hr /><br />\n");
            if (Config.listing) {
                for (let i = 0; i < files.length; i++) {
                    let file = files[i];
                    if (!cache_path.endsWith("/")) cache_path = cache_path + "/";
                    file = cache_path + file;
                    if (Fs.lstatSync(cache_path).isDirectory() && !file.endsWith("/")) file = file + "/";
                    file = file.substring(Config.cache_dir.length);
                    console.log(file);
                    resp.write("<a href='" + file + "'>" + file + "</a><br />\n");
                }
            }
            resp.end();
        }
    });

}

function getFromCache(path, resp, is_dl_callback) {
    // Queue the request. This is done to prevent multiple downloads for the same unavailable artifact
    // while it's being cached
    Queue.push(function () {
        let cache_path = Config.cache_dir + "/" + path;
        // Check if path is locked (ie if the artifact is being downloaded because of a previous request)
        if (Path.isLocked(cache_path)) {
            // console.log("skip");
            return false;
        }

        if (Config.dont_cache_snapshots && !is_dl_callback && cache_path.substring(cache_path.indexOf("/")).indexOf("-SNAPSHOT") != -1) {
            if (Path.isLockedForDownload(cache_path)) {
                // console.log("skip");
                return false;
            }
            if (Fs.existsSync(cache_path)) {
                console.log("Refresh snapshot", cache_path);
                Fs.unlinkSync(cache_path);
            }
        }

        // Retuns from cache
        if (Fs.existsSync(cache_path)) {
            if (!Fs.lstatSync(cache_path).isDirectory()) {
                Path.lockForDownload(cache_path);
                resp.writeHead(200, {
                    "Content-Type": "application/octet-stream"
                });
                Fs.createReadStream(Config.cache_dir + "/" + path)
                    .on('end', function () {
                        Path.unlockForDownload(cache_path);
                    }).on('error', function (err) {
                        Path.unlockForDownload(cache_path);
                        console.log(err);
                    })
                    .pipe(resp)
            } else {
                listDirectory(cache_path, resp);
            }
        } else {
            // If not available, try to download it from the repos
            let p = Config.cache_dir + "/" + path;
            p = p.substring(0, p.lastIndexOf("/"));

            mkdir_p(p, 0777, function (err) {
                if (err) {
                    console.error(err);
                    resp.writeHead(500, { "Content-Type": "text/plain" });
                    resp.write("500 Server Error\n");
                    resp.end();
                } else downloadToCache(path, resp);
            });
        }
        return true;
    });

    // Process queue immediately
    loopQueue();
}
let options = {

}


let req_handle = function (req, res) {
    let uri = req.url.substring(1);
    let authorized = true;
    if (Auth.length !== 0) {
        let credentials = BasicAuth(req)
        if (!credentials) authorized = false;
        else {
            for (let i = 0; i < Auth.length; i++) {
                let rg = new RegExp(Auth[i].path);
                if (rg.test(uri)) {
                    authorized = false;
                    if (Auth[i].user === credentials.name && Auth[i].password === credentials.pass) authorized = true;
                    else {
                        console.log("Authentication Failed");
                        // console.log(credentials);
                        // console.log(Auth[i]);
                    }
                    break;
                }
            }
        }
    }
    if (!authorized) {
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="maven-proxy"')
        res.end('Access denied')
    } else getFromCache(uri, res);
};

let server;
if (Config.protocol === "https") {
    options.cert = Fs.readFileSync(Config.https.cert);
    options.key = Fs.readFileSync(Config.https.key);
    server = Https.createServer(options, req_handle);
} else {
    server = Http.createServer(req_handle);
}
server.listen(Config.port, Config.addr);

console.log("Server running", Config.addr + ":" + Config.port);