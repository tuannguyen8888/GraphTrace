#!/usr/bin/env node

import { runCli } from "./index.js";

const result = await runCli(process.argv.slice(2));

if (result.stdout) {
  console.log(result.stdout);
}

if (result.stderr) {
  console.error(result.stderr);
}

if (result.keepAlive) {
  process.exitCode = result.exitCode;
} else {
  process.exit(result.exitCode);
}
