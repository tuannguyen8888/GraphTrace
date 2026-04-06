import { execFile, spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const packageRoot = join(repoRoot, "packages", "cli");
const fixtureRoot = join(repoRoot, "fixtures", "express-prisma-workspace");

const tempRoot = await mkdtemp(join(tmpdir(), "graphtrace-pack-"));
const packDir = join(tempRoot, "pack");
const installDir = join(tempRoot, "install");
const workspaceRoot = join(tempRoot, "workspace");

let serverProcess;

try {
  await mkdir(packDir, { recursive: true });
  await mkdir(installDir, { recursive: true });
  await cp(fixtureRoot, workspaceRoot, { recursive: true });
  await rm(join(workspaceRoot, ".graphtrace"), {
    recursive: true,
    force: true,
  });

  await execFileAsync("pnpm", ["--dir", packageRoot, "build"], {
    cwd: repoRoot,
  });

  await execFileAsync(
    "pnpm",
    ["--dir", packageRoot, "pack", "--pack-destination", packDir],
    {
      cwd: repoRoot,
    },
  );

  const tarballName = (
    await execFileAsync("sh", ["-lc", "ls -1 *.tgz"], {
      cwd: packDir,
    })
  ).stdout.trim();
  const tarballPath = join(packDir, tarballName);

  await execFileAsync("npm", ["init", "-y"], {
    cwd: installDir,
  });
  await execFileAsync("npm", ["install", tarballPath], {
    cwd: installDir,
  });

  const cliBin = join(installDir, "node_modules", ".bin", "graphtrace");

  await execFileAsync(cliBin, ["doctor"], { cwd: workspaceRoot });
  await execFileAsync(cliBin, ["init"], { cwd: workspaceRoot });
  const indexResult = await execFileAsync(
    cliBin,
    ["index", "--full", "--json"],
    {
      cwd: workspaceRoot,
    },
  );
  const indexPayload = JSON.parse(indexResult.stdout);
  if ((indexPayload.summary?.routeCount ?? 0) < 1) {
    throw new Error(`Smoke index failed: ${indexResult.stdout}`);
  }

  const searchResult = await execFileAsync(
    cliBin,
    ["search", "users", "--kind", "route"],
    { cwd: workspaceRoot },
  );
  const searchPayload = JSON.parse(searchResult.stdout);
  if (
    !Array.isArray(searchPayload.items) ||
    !searchPayload.items.some((item) => item.id === "GET /users")
  ) {
    throw new Error(`Smoke search failed: ${searchResult.stdout}`);
  }

  serverProcess = spawn(cliBin, ["web", "--port", "4427"], {
    cwd: workspaceRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  serverProcess.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  serverProcess.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const start = Date.now();
  while (
    Date.now() - start < 15_000 &&
    !stdout.includes("web:http://127.0.0.1:4427")
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (!stdout.includes("web:http://127.0.0.1:4427")) {
    throw new Error(
      `Web server did not start.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
    );
  }

  const [rootResponse, statusResponse] = await Promise.all([
    fetch("http://127.0.0.1:4427/"),
    fetch("http://127.0.0.1:4427/api/status"),
  ]);

  if (!rootResponse.ok) {
    throw new Error(`Root page failed with ${rootResponse.status}`);
  }
  if (!statusResponse.ok) {
    throw new Error(`/api/status failed with ${statusResponse.status}`);
  }
} finally {
  serverProcess?.kill("SIGTERM");
  await rm(tempRoot, { recursive: true, force: true });
}
