import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const manifestPath = path.join(repoRoot, "scripts/harness/runtime-entrypoints.json");

const requiredNames = new Set([
  "school-reservation-create",
  "school-pickdrop-create",
  "home-reservation-entry",
  "hoteling-reservation-entry",
  "member-search-page",
]);

const errors = [];

if (!fs.existsSync(manifestPath)) {
  console.error("check-runtime-entrypoints failed:");
  console.error("- Missing manifest: scripts/harness/runtime-entrypoints.json");
  process.exit(1);
}

let manifest = [];

try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error("check-runtime-entrypoints failed:");
  console.error(`- Could not parse runtime-entrypoints.json: ${error.message}`);
  process.exit(1);
}

if (!Array.isArray(manifest)) {
  console.error("check-runtime-entrypoints failed:");
  console.error("- runtime-entrypoints.json must contain an array");
  process.exit(1);
}

manifest.forEach((entry, index) => {
  const label = entry?.name || `entry-${index}`;
  ["name", "entrypoint", "controller", "sharedModule", "sharedComponentSource", "authorityDecision"].forEach((key) => {
    if (typeof entry?.[key] !== "string" || entry[key].trim().length === 0) {
      errors.push(`${label}: missing required string field "${key}"`);
    }
  });

  if (!Array.isArray(entry?.duplicateCandidates)) {
    errors.push(`${label}: duplicateCandidates must be an array`);
  }

  ["entrypoint", "controller", "sharedModule", "sharedComponentSource"].forEach((key) => {
    if (typeof entry?.[key] !== "string") return;
    const absolutePath = path.join(repoRoot, entry[key]);
    if (!fs.existsSync(absolutePath)) {
      errors.push(`${label}: path does not exist for ${key}: ${entry[key]}`);
    }
  });

  if (Array.isArray(entry?.duplicateCandidates)) {
    entry.duplicateCandidates.forEach((candidate) => {
      if (typeof candidate !== "string" || candidate.trim().length === 0) {
        errors.push(`${label}: duplicate candidate must be a non-empty string`);
        return;
      }
      const absolutePath = path.join(repoRoot, candidate);
      if (!fs.existsSync(absolutePath)) {
        errors.push(`${label}: duplicate candidate path does not exist: ${candidate}`);
      }
    });
  }
});

const manifestNames = new Set(manifest.map((entry) => entry?.name).filter(Boolean));
requiredNames.forEach((name) => {
  if (!manifestNames.has(name)) {
    errors.push(`Missing required runtime entrypoint manifest record: ${name}`);
  }
});

if (errors.length > 0) {
  console.error("check-runtime-entrypoints failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("check-runtime-entrypoints passed");
