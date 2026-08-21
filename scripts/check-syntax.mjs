import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const excludedDirectories = new Set([
  ".git",
  "node_modules",
  "coverage",
  "System/session",
  "System/Cache",
]);
const sourceFiles = [];

async function collect(directory = ".") {
  const absoluteDirectory = path.join(root, directory);
  for (const entry of await readdir(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = path.join(directory, entry.name);
    const normalizedPath = relativePath.replaceAll(path.sep, "/").replace(/^\.\//, "");
    if (entry.isDirectory()) {
      if (excludedDirectories.has(entry.name) || excludedDirectories.has(normalizedPath)) {
        continue;
      }
      await collect(relativePath);
    } else if (/\.(?:js|mjs|cjs)$/i.test(entry.name)) {
      sourceFiles.push(normalizedPath);
    }
  }
}

await collect();
sourceFiles.sort();

const failures = [];
for (const file of sourceFiles) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failures.push({ file, diagnostic: (result.stderr || result.stdout).trim() });
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`\nSyntax check failed: ${failure.file}\n${failure.diagnostic}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Syntax check passed for ${sourceFiles.length} JavaScript files.`);
}
