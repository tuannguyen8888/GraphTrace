import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@graphtrace/shared": resolve(
        currentDir,
        "..",
        "..",
        "packages",
        "shared",
        "src",
        "index.ts",
      ),
    },
  },
});
