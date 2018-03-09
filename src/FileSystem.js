
const Fs = require('fs');

module.exports = {
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

        if (Fs.existsSync(path + ".dl")) return true;
    },
    isLockedForDownload: function (path) {
        return Fs.existsSync(path + ".dl");

    }

}




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
module.exports.mkdir_p = mkdir_p;