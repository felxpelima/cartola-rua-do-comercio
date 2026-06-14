import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["api", "lib", "scripts", "tests"];
const rootFiles = ["admin.js", "back-to-top.js", "landing.js", "participant.js"];
const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry !== "node_modules" && entry !== ".git") walk(full);
    } else if (/\.(js|mjs)$/.test(entry)) {
      files.push(full);
    }
  }
}

for (const file of rootFiles) files.push(file);
for (const dir of roots) walk(dir);

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`JS syntax ok (${files.length} files).`);
