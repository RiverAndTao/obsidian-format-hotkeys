const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const vaultConfigPath = path.join(rootDir, "obsidian-vault.config.json");

if (!fs.existsSync(vaultConfigPath)) {
    console.error("Missing obsidian-vault.config.json");
    process.exit(1);
}

const { pluginsDir } = JSON.parse(fs.readFileSync(vaultConfigPath, "utf8"));
const pluginDir = process.cwd();
const manifestPath = path.join(pluginDir, "manifest.json");

if (!fs.existsSync(manifestPath)) {
    console.error("Run install from an Obsidian plugin directory (manifest.json not found).");
    process.exit(1);
}

const { id } = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const destDir = path.join(pluginsDir, id);
const files = ["main.js", "manifest.json", "versions.json", "styles.css"];

fs.mkdirSync(destDir, { recursive: true });

for (const file of files) {
    const src = path.join(pluginDir, file);
    if (!fs.existsSync(src)) {
        if (file === "styles.css") {
            continue;
        }
        console.error(`Missing ${file}, build may have failed.`);
        process.exit(1);
    }
    fs.copyFileSync(src, path.join(destDir, file));
}

console.log(`Installed to ${destDir}`);
