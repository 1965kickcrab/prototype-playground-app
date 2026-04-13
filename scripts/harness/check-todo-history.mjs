import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const todoPath = path.join(repoRoot, "TODO.md");
const historyPath = path.join(repoRoot, "history/HISTORY.md");

const errors = [];

function readLines(filePath) {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/);
}

function extractSection(lines, heading) {
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return [];
  const section = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s+/.test(line)) break;
    section.push(line);
  }
  return section;
}

if (!fs.existsSync(todoPath)) {
  errors.push("Missing TODO.md");
}

if (!fs.existsSync(historyPath)) {
  errors.push("Missing history/HISTORY.md");
}

if (errors.length === 0) {
  const todoLines = readLines(todoPath);
  const historyLines = readLines(historyPath);

  const currentFocus = extractSection(todoLines, "## Current Focus")
    .filter((line) => line.trim().startsWith("- [ ]"));
  if (currentFocus.length > 1) {
    errors.push(`TODO.md must keep at most one active structural task in Current Focus; found ${currentFocus.length}`);
  }

  const bulletLines = todoLines
    .map((line) => line.trim())
    .filter((line) => /^- \[[ x]\]/.test(line))
    .map((line) => line.replace(/^- \[[ x]\]\s*/, ""));

  const seen = new Set();
  const duplicates = new Set();
  bulletLines.forEach((item) => {
    if (seen.has(item)) {
      duplicates.add(item);
      return;
    }
    seen.add(item);
  });
  duplicates.forEach((item) => {
    errors.push(`TODO.md has duplicate item text across sections: ${item}`);
  });

  if (historyLines.length > 200) {
    errors.push(`history/HISTORY.md must remain short (<= 200 lines); found ${historyLines.length}`);
  }

  if (!historyLines.some((line) => line.trim() === "## Current Snapshot")) {
    errors.push("history/HISTORY.md must include '## Current Snapshot'");
  }

  if (!historyLines.some((line) => line.trim() === "## Recent Changes")) {
    errors.push("history/HISTORY.md must include '## Recent Changes'");
  }
}

if (errors.length > 0) {
  console.error("check-todo-history failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("check-todo-history passed");
