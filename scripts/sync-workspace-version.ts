import { cwd, exit } from "node:process";

import {
  readVersionTargets,
  syncWorkspaceVersions,
} from "../packages/config/src/versioning";

const args = new Set(process.argv.slice(2));
const workspaceRoot = cwd();

const targets = await readVersionTargets(workspaceRoot);
const canonicalVersion = targets.find(
  (target) => target.name === "graphtrace",
)?.version;

if (!canonicalVersion) {
  throw new Error("Unable to determine the canonical graphtrace version.");
}

if (args.has("--check")) {
  const mismatches = targets.filter(
    (target) => target.version !== canonicalVersion,
  );

  if (mismatches.length === 0) {
    exit(0);
  }

  for (const mismatch of mismatches) {
    console.error(
      `${mismatch.path} is ${mismatch.version}, expected ${canonicalVersion}`,
    );
  }
  exit(1);
}

await syncWorkspaceVersions(workspaceRoot, canonicalVersion);
