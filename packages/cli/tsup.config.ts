import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/bin.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  target: "node22",
  tsconfig: "../../tsconfig.json",
  noExternal: [/^@graphtrace\//],
});
