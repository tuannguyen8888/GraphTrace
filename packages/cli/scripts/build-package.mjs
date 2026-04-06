import { execFileSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(scriptDir, "..");
const repoRoot = join(packageRoot, "..", "..");
const webDistRoot = join(repoRoot, "apps", "web", "dist");
const cliDistRoot = join(packageRoot, "dist");
const packagedWebRoot = join(cliDistRoot, "web-dist");

execFileSync("pnpm", ["--dir", join(repoRoot, "apps", "web"), "build"], {
  cwd: packageRoot,
  stdio: "inherit",
});

execFileSync("pnpm", ["exec", "tsup", "--config", "tsup.config.ts"], {
  cwd: packageRoot,
  stdio: "inherit",
});

await rm(packagedWebRoot, { recursive: true, force: true });
await mkdir(cliDistRoot, { recursive: true });
await cp(webDistRoot, packagedWebRoot, { recursive: true });

execFileSync(
  "node",
  [
    join(repoRoot, "scripts", "fix-node-protocol.mjs"),
    join(cliDistRoot, "index.js"),
    join(cliDistRoot, "bin.js"),
  ],
  {
    cwd: packageRoot,
    stdio: "inherit",
  },
);
