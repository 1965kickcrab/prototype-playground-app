import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const checks = [
  "check-doc-links.mjs",
  "check-layer-imports.mjs",
  "check-runtime-entrypoints.mjs",
  "check-todo-history.mjs",
];

for (const check of checks) {
  const checkPath = path.join(__dirname, check);
  const result = spawnSync(process.execPath, [checkPath], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log("run-all passed");
