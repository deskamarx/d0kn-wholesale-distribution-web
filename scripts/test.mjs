import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const root = process.cwd();
const outfile = path.join(os.tmpdir() ?? ".", `d0kn-phase2-tests-${process.pid}.mjs`);

await build({
  entryPoints: [path.join(root, "tests/phase2.test.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  logLevel: "warning",
});

try {
  await import(pathToFileURL(outfile).href);
} finally {
  fs.rmSync(outfile, { force: true });
}
