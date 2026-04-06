#!/usr/bin/env node

import { runCli } from "./index.js";

const result = await runCli(process.argv.slice(2), {
  emitStdout: (line) => {
    console.log(line);
  },
  emitStderr: (line) => {
    console.error(line);
  },
});

if (result.stdout) {
  console.log(result.stdout);
}

if (result.stderr) {
  console.error(result.stderr);
}

process.exitCode = result.exitCode;
