// prepare-raycast — makes `ray develop`/`ray build` work inside the npm-workspaces monorepo.
//
// Why this exists: the Raycast CLI checks for `./node_modules/.bin/tsc` relative to the
// extension directory (packages/raycast). npm workspaces HOIST that bin to the repo-root
// node_modules/.bin, so the extension-local path is missing and ray aborts with
// "please install the TypeScript compiler". This does NOT affect bundling @reclaimd/core —
// that resolves and bundles fine; it's purely ray's hardcoded local-tsc check.
//
// Fix: ensure an extension-local symlink packages/raycast/node_modules/.bin/tsc → the hoisted
// TypeScript. Idempotent; safe to run on every `ray` invocation. node_modules is gitignored,
// so this recreates the link after a fresh `npm install` or clone.
import { existsSync, mkdirSync, symlinkSync, lstatSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const binDir = join(repo, "packages/raycast/node_modules/.bin");
const link = join(binDir, "tsc");
const hoisted = join(repo, "node_modules/typescript/bin/tsc");

if (!existsSync(hoisted)) {
  console.error("prepare-raycast: TypeScript not found at node_modules/typescript — run `npm install` first.");
  process.exit(1);
}

let linkExists = false;
try {
  linkExists = lstatSync(link) !== undefined;
} catch {
  linkExists = false;
}

if (!linkExists) {
  mkdirSync(binDir, { recursive: true });
  // Relative target so the link stays valid regardless of absolute repo location.
  symlinkSync("../../../../node_modules/typescript/bin/tsc", link);
  console.log("prepare-raycast: linked extension-local tsc for the Raycast CLI");
} else {
  console.log("prepare-raycast: extension-local tsc already present");
}
