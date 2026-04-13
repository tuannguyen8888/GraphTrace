import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/test",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4310",
  },
  webServer: {
    command:
      "pnpm web:build && pnpm tsx apps/web/test/helpers/graphtrace-fixture-server.ts",
    url: "http://127.0.0.1:4310",
    reuseExistingServer: true,
  },
});
