const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const {bashExec, toCygwinPath} = require("./../bash-exec");

const cygwinFolder = path.join(__dirname, "..", ".cygwin");

const getNameForKey = (key) => {
    return key.trim().split("/").join("_s_");
}

const readLinks = () => {
    const linkInfo = fs.readFileSync(path.join(cygwinFolder, "links.json")).toString("utf8");
    return JSON.parse(linkInfo);
}

const consolidateLinks = () => {
    // Take the links as input, and:
    // 1) Move the executables to a 'links' folder
    // 2) Delete all linked references

    if(!fs.existsSync(path.join(cygwinFolder, "_links"))) {
        fs.mkdirSync(path.join(cygwinFolder, "_links"));
    }

    const deleteFile = (file) => {
        const fileToDelete = path.join(cygwinFolder, path.normalize(file.trim()));
        console.log(`Deleting: ${fileToDelete}`);
        if (!fs.existsSync(fileToDelete)) {
            console.warn("- Not present: " + fileToDelete);
        } else {
            fs.unlinkSync(fileToDelete);
        }
    }

    const allLinks = readLinks();
    const links = allLinks.hardlinks;
    // Consolidate hard links
    Object.keys(links).forEach((key) => {
        const l = links[key];

        const src = path.join(cygwinFolder, path.normalize(key.trim()));
        const dst = path.join(cygwinFolder, "_links", getNameForKey(key));
        console.log("Source folder: " + src);
        console.log("Dest folder: " + dst);

        try {
            fs.copyFileSync(src, dst);
        } catch (ex) {
            console.error(ex);
            exit(1);
        }

        l.forEach((file) => {
            deleteFile(file);
        })
    });
}

const ensureFolder = (p) => {
    if (fs.existsSync(p)) {
        return;
    }

    ensureFolder(path.dirname(p));

    fs.mkdirSync(p);
};

const restoreLinks = () => {
    // Take links as input, and:
    // Create hardlinks from the '_links' folder to all the relevant binaries

    const allLinks = readLinks();

    // Hydrate hard links
    console.log("Hydrating hardlinks...");
    const links = allLinks.hardlinks;
    Object.keys(links).forEach((key) => {
        const l = links[key];

        const src = path.join(cygwinFolder, "_links", getNameForKey(key));

        l.forEach((file) => {
            const dst = path.join(cygwinFolder, file.trim());
            ensureFolder(path.dirname(dst));

            if (fs.existsSync(dst)) {
                console.warn("Warning - file already exists: " + dst);
            } else {
                fs.linkSync(src, dst);
            }
        })
    });

    // Hydrate symlinks
    console.log("Hydrating symlinks...");
    const symlinks = allLinks.symlinks;
    Object.keys(symlinks).forEach((key) => {
        const link = path.join(cygwinFolder, key);

        let orig = symlinks[key];

        // If the key points to an absolute path, use that.
        // Otherwise, it's relative to the link, so append the path.
        if (orig[0] !== '/' && orig[0] !== '\\') { 
            orig = path.dirname(link) + "/" + orig;
        } else {
            orig = path.join(cygwinFolder, orig);
        }

        if (!fs.existsSync(orig)) {
            console.warn("Cannot find original path: " + orig + ", skipping symlink: " + link);
            return;
        }

        if (fs.existsSync(link)) {
            console.warn("Removing existing file at: " + link);
            fs.unlinkSync(link);
        }

        console.log(`Linking ${link} to ${orig}`)
        const cygLink = toCygwinPath(link);
        const cygOrig = toCygwinPath(orig);
        cp.spawnSync(path.join(cygwinFolder, "bin", "bash.exe"), ["-lc", `ln -s ${cygOrig} ${cygLink}`]);
    });

    console.log("Links successfully restored.");
}

module.exports = {
    consolidateLinks,
    restoreLinks
};
