import { readFile, writeFile } from "node:fs/promises";

const [, , ...targets] = process.argv;

if (targets.length === 0) {
  throw new Error("Expected at least one file path to patch.");
}

for (const target of targets) {
  const source = await readFile(target, "utf8");
  const patched = source.replaceAll('from "sqlite"', 'from "node:sqlite"');

  if (patched !== source) {
    await writeFile(target, patched, "utf8");
  }
}
