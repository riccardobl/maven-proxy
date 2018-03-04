

const Http = require('http');
const Request = require('request');
const Fs = require('fs');
const BasicAuth = require('basic-auth');

let config = process.argv[2];
if (!config) config = "./proxy.json";
console.log("Config file", config);

let auth = process.argv[3];
if (!auth) auth = "./auth.json";
console.log("Auth file", auth);

const Config = JSON.parse(Fs.readFileSync(config, 'utf8'));

const Auth = auth==="null"?[]:JSON.parse(Fs.readFileSync(auth, 'utf8'));

console.log("Config", Config);

/**
 * https://gist.github.com/bpedro/742162
 * Offers functionality similar to mkdir -p
 *
 * Asynchronous operation. No arguments other than a possible exception
 * are given to the completion callback.
 */
function mkdir_p(path, mode, callback, position) {
    console.log("mkdir -p", path);
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


function downloadToCache(path, resp) {
    let lock = function () { Fs.writeFile(Config.cache_dir + "/" + path + ".lock", "1", function () { }); }
    let unlock = function () { Fs.unlink(Config.cache_dir + "/" + path + ".lock", function () { }); }

    // Lock path
    lock();

    // Check if artifact exists at given url
    // calls callback(true) if found
    let tryurl = function (url, callback) {
        let req = Request(url)
            .on('response', function (response) {
                if (response.statusCode === 200) {
                    console.log("Found in", url);
                    let outfs = Fs.createWriteStream(Config.cache_dir + "/" + path);
                    req.pipe(outfs)
                        .on('finish', function () {
                            callback(true);
                            unlock(); // Everything has been written, unlock path
                            getFromCache(path, resp); // Retrieve downloaded artifact
                        }).on("error", function (error) {
                            console.error("Error", error);
                            outfs.close();
                            callback(false);
                        });
                } else {
                    console.log("Not found in", url);
                    callback(false);
                    console.log(response.statusCode);
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
                    unlock();
                    resp.writeHead(404, {"Content-Type": "text/plain"});
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
            resp.writeHead(200, {"Content-Type": "text/html"});
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

function getFromCache(path, resp) {
    // Queue the request. This is done to prevent multiple downloads for the same unavailable artifact
    // while it's being cached
    Queue.push(function () {
        let cache_path = Config.cache_dir + "/" + path;
        // Check if path is locked (ie if the artifact is being downloaded because of a previous request)
        if (Fs.existsSync(cache_path + ".lock")) return false;

        // Retuns from cache
        if (Fs.existsSync(cache_path)) {
            if (!Fs.lstatSync(cache_path).isDirectory()) {
                resp.writeHead(200, {
                    "Content-Type": "application/octet-stream"
                });
                Fs.createReadStream(Config.cache_dir + "/" + path).pipe(resp);
            } else {
                listDirectory(cache_path,resp);
            }
        } else {
            // If not available, try to download it from the repos
            let p = Config.cache_dir + "/" + path;
            p = p.substring(0, p.lastIndexOf("/"));

            mkdir_p(p, 0777, function (err) {
                if (err) {
                    console.error(err);
                    resp.writeHead(500, {"Content-Type": "text/plain"});
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



Http.createServer(function (req, res) {   
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
    }else  getFromCache(uri, res);
}).listen(Config.port,Config.addr);

console.log("Server running", Config.addr + ":" + Config.port);