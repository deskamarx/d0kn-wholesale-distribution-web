import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "assets");
fs.mkdirSync(outDir, { recursive: true });

const iconSvg = fs.readFileSync(path.join(root, "public/icon.svg"), "utf8");
await sharp(Buffer.from(iconSvg)).resize(1024, 1024).png().toFile(path.join(outDir, "icon.png"));

const iconPng = await sharp(Buffer.from(iconSvg)).resize(1100, 1100).png().toBuffer();
await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: "#0d1733" },
})
  .composite([{ input: iconPng, gravity: "centre" }])
  .png()
  .toFile(path.join(outDir, "splash.png"));

console.log("Generated assets/icon.png and assets/splash.png");
