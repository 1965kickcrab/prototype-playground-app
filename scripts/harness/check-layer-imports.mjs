import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const srcRoot = path.join(repoRoot, "src");

const allowedComponentStorageFiles = new Set([
  "src/components/calendar.js",
  "src/components/hoteling-calendar.js",
  "src/components/list.js",
  "src/components/member-ticket-issue-modal.js",
  "src/components/ticket-issue-modal.js",
]);

const contracts = {
  pages: new Set(["pages", "components", "services", "storage", "utils", "config"]),
  components: new Set(["components", "services", "utils", "config", "storage"]),
  services: new Set(["services", "storage", "utils", "config"]),
  storage: new Set(["storage", "services", "utils", "config"]),
  utils: new Set(["utils", "services", "config"]),
};

const errors = [];

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const nextPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFiles(nextPath));
      continue;
    }
    if (/\.(js|mjs)$/i.test(entry.name)) {
      results.push(nextPath);
    }
  }
  return results;
}

function getLayerFromAbsolutePath(absolutePath) {
  const relativePath = path.relative(srcRoot, absolutePath).replace(/\\/g, "/");
  const [topLevel] = relativePath.split("/");
  return contracts[topLevel] ? topLevel : null;
}

function getResolvedImportPath(sourceFile, specifier) {
  const basePath = path.resolve(path.dirname(sourceFile), specifier);
  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, "index.js"),
    path.join(basePath, "index.mjs"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function collectImports(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const matches = [];
  const importRegex = /from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/g;
  let match = importRegex.exec(source);
  while (match) {
    const specifier = match[1] || match[2];
    if (specifier) {
      matches.push(specifier);
    }
    match = importRegex.exec(source);
  }
  return matches;
}

for (const filePath of listFiles(srcRoot)) {
  const sourceLayer = getLayerFromAbsolutePath(filePath);
  if (!sourceLayer) continue;

  const sourceRelative = path.relative(repoRoot, filePath).replace(/\\/g, "/");
  const allowedTargets = contracts[sourceLayer];

  for (const specifier of collectImports(filePath)) {
    if (!specifier.startsWith(".")) continue;
    const resolvedPath = getResolvedImportPath(filePath, specifier);
    if (!resolvedPath) continue;

    const targetLayer = getLayerFromAbsolutePath(resolvedPath);
    if (!targetLayer) continue;

    if (!allowedTargets.has(targetLayer)) {
      errors.push(`${sourceRelative} must not import ${targetLayer} via ${specifier}`);
      continue;
    }

    if (sourceLayer === "components" && targetLayer === "storage") {
      if (!allowedComponentStorageFiles.has(sourceRelative)) {
        errors.push(`${sourceRelative} imports storage via ${specifier} but is not in the established component->storage allowlist`);
      }
    }

    if (sourceLayer === "utils" && ["pages", "components", "storage"].includes(targetLayer)) {
      errors.push(`${sourceRelative} must stay UI-agnostic and not import ${targetLayer} via ${specifier}`);
    }

    if (sourceLayer === "services" && ["pages", "components"].includes(targetLayer)) {
      errors.push(`${sourceRelative} must not import ${targetLayer} via ${specifier}`);
    }

    if (sourceLayer === "storage" && ["pages", "components"].includes(targetLayer)) {
      errors.push(`${sourceRelative} must not import ${targetLayer} via ${specifier}`);
    }
  }
}

if (errors.length > 0) {
  console.error("check-layer-imports failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("check-layer-imports passed");
