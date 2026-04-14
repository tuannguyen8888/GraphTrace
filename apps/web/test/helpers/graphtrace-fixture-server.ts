import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { createGraphTraceDaemon } from "../../../../packages/server/src/daemon";
import { createGraphTraceApp } from "../../../../packages/server/src/index";

const PORT = 4310;
const HOST = "127.0.0.1";
const symbolGraphFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "symbol-graph-workspace",
);
const crudboosterFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "crudbooster-legacy-workspace",
);

const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-playwright-"));
const daemon = createGraphTraceDaemon({ homeDir });

try {
  await daemon.addWorkspace(symbolGraphFixtureRoot, {
    label: "Symbol Graph Fixture",
  });
  await daemon.addWorkspace(crudboosterFixtureRoot, {
    label: "CrudBooster Fixture",
  });

  const app = createGraphTraceApp({ daemon });
  await app.listen({
    host: HOST,
    port: PORT,
  });

  const shutdown = async () => {
    await app.close();
    daemon.close();
    await rm(homeDir, { recursive: true, force: true });
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  console.log(`GraphTrace fixture server ready at http://${HOST}:${PORT}`);
} catch (error) {
  daemon.close();
  await rm(homeDir, { recursive: true, force: true });
  throw error;
}
