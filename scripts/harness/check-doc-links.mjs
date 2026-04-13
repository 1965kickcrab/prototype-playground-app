import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const requiredDocs = [
  "docs/README.md",
  "docs/repo-map.md",
  "docs/layer-contracts.md",
  "docs/change-workflow.md",
  "docs/checklists/ui-contract-safety.md",
];

const requiredMentions = [
  {
    file: "README.md",
    includes: ["AGENTS.md", "docs/README.md"],
  },
  {
    file: "AGENTS.md",
    includes: ["docs/repo-map.md", "docs/layer-contracts.md"],
  },
];

const errors = [];

for (const relativePath of requiredDocs) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`Missing required doc: ${relativePath}`);
  }
}

for (const check of requiredMentions) {
  const absolutePath = path.join(repoRoot, check.file);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`Missing file for link check: ${check.file}`);
    continue;
  }
  const content = fs.readFileSync(absolutePath, "utf8");
  check.includes.forEach((needle) => {
    if (!content.includes(needle)) {
      errors.push(`${check.file} must reference ${needle}`);
    }
  });
}

if (errors.length > 0) {
  console.error("check-doc-links failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("check-doc-links passed");
