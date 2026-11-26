import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error("Run npm run build before npm run smoke.");
  process.exit(1);
}

const base = "http://127.0.0.1:4179/d0kn-wholesale-distribution-web/";
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const child = spawn(process.execPath, [viteBin, "preview", "--host", "127.0.0.1", "--port", "4179", "--strictPort"], {
  cwd: root,
  stdio: "ignore",
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(base);
      if (response.ok) { ready = true; break; }
    } catch { /* server not up yet */ }
    await wait(250);
  }
  if (!ready) throw new Error("Preview server did not become ready.");

  const index = await (await fetch(base)).text();
  if (!index.includes('<div id="root"></div>')) throw new Error("Root mount missing from index.");
  const assets = Array.from(index.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)).map((match) => match[1]);
  if (assets.length < 2) throw new Error("Built JS/CSS assets missing from index.");
  for (const asset of assets) {
    const response = await fetch(new URL(asset.replace(/^\.\//, ""), base));
    if (!response.ok) throw new Error(`Asset failed: ${asset}`);
  }

  const manifest = await (await fetch(new URL("manifest.webmanifest", base))).text();
  if (!manifest.includes("D0K@N")) throw new Error("Manifest missing app name.");
  const sw = await (await fetch(new URL("sw.js", base))).text();
  if (!sw.includes("d0kn-distribution-shell-v5")) throw new Error("Service worker cache not bumped to v5.");

  const routes = ["dashboard", "intelligence", "analytics", "suppliers", "products", "imports", "shipments", "warehouse", "customers", "quotations", "orders", "invoices", "payments", "compliance", "search", "settings"];
  for (const route of routes) {
    const response = await fetch(new URL(`#${route}`, base));
    if (!response.ok) throw new Error(`Route failed: ${route}`);
  }

  console.log(`Smoke passed: ${assets.length} assets, ${routes.length} routes, manifest, and service worker.`);
}

try {
  await main();
} finally {
  child.kill("SIGTERM");
}
