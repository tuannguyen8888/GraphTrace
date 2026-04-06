import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@graphtrace/shared": resolve(__dirname, "packages/shared/src/index.ts"),
      "@graphtrace/config": resolve(__dirname, "packages/config/src/index.ts"),
      "@graphtrace/storage": resolve(
        __dirname,
        "packages/storage/src/index.ts",
      ),
      "@graphtrace/indexer": resolve(
        __dirname,
        "packages/indexer/src/index.ts",
      ),
      "@graphtrace/query-engine": resolve(
        __dirname,
        "packages/query-engine/src/index.ts",
      ),
      "@graphtrace/server": resolve(__dirname, "packages/server/src/index.ts"),
      "@graphtrace/mcp": resolve(__dirname, "packages/mcp/src/index.ts"),
      "@graphtrace/cli": resolve(__dirname, "packages/cli/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["packages/**/test/**/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
