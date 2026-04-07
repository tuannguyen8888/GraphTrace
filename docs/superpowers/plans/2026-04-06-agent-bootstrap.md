# Agent Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `graphtrace agent setup` so GraphTrace can generate project-local MCP and instruction files for Codex, Claude Code, and Cursor, plus README guidance for any remaining manual approval step.

**Architecture:** Keep agent bootstrap entirely inside the CLI package. Introduce a small `agent` module that detects local tool executables, renders per-tool config/instruction templates, and reconciles files idempotently inside the current repository. Wire the CLI to that module, then document the resulting workflow in the README.

**Tech Stack:** TypeScript, Node.js filesystem APIs, Vitest, Markdown, TOML/JSON text generation

---

## Chunk 1: Agent Bootstrap Core

### Task 1: Add failing tests for bootstrap discovery and write planning

**Files:**
- Create: `packages/cli/test/agent-setup.test.ts`
- Modify: `packages/cli/test/cli.test.ts`
- Reference: `docs/superpowers/specs/2026-04-06-agent-bootstrap-design.md`

- [ ] Step 1: Add a failing test in `packages/cli/test/agent-setup.test.ts` that expects a bootstrap planner to return project-local targets for `codex`, `claude`, and `cursor`.
- [ ] Step 2: Add a failing test in `packages/cli/test/agent-setup.test.ts` that expects executable detection to be advisory, not required, when planning files.
- [ ] Step 3: Run `pnpm test -- --run packages/cli/test/agent-setup.test.ts` and verify the new tests fail because the bootstrap module does not exist yet.
- [ ] Step 4: Add minimal bootstrap planning code in `packages/cli/src/agent/bootstrap.ts` that returns target paths and advisory detection status.
- [ ] Step 5: Run `pnpm test -- --run packages/cli/test/agent-setup.test.ts` and verify the planning tests pass.

### Task 2: Add failing tests for file rendering and idempotent merge behavior

**Files:**
- Create: `packages/cli/src/agent/templates.ts`
- Create: `packages/cli/src/agent/files.ts`
- Modify: `packages/cli/test/agent-setup.test.ts`

- [ ] Step 1: Add a failing test that expects Codex config rendering to produce `.codex/config.toml` with a GraphTrace MCP stdio entry.
- [ ] Step 2: Add a failing test that expects Claude config rendering to produce `.mcp.json` and a managed GraphTrace block in `.claude/CLAUDE.md`.
- [ ] Step 3: Add a failing test that expects Cursor rendering to produce `.cursor/mcp.json` and `.cursor/rules/graphtrace.mdc`.
- [ ] Step 4: Add a failing test that expects re-running reconciliation not to duplicate MCP entries or managed instruction blocks.
- [ ] Step 5: Run `pnpm test -- --run packages/cli/test/agent-setup.test.ts` and verify the new tests fail for missing rendering and merge code.
- [ ] Step 6: Implement minimal template rendering in `packages/cli/src/agent/templates.ts`.
- [ ] Step 7: Implement idempotent file reconciliation in `packages/cli/src/agent/files.ts`, including managed block replacement for shared instruction files.
- [ ] Step 8: Run `pnpm test -- --run packages/cli/test/agent-setup.test.ts` and verify the rendering and merge tests pass.

## Chunk 2: CLI Integration

### Task 3: Add failing CLI tests for `graphtrace agent setup`

**Files:**
- Modify: `packages/cli/test/cli.test.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] Step 1: Add a failing test in `packages/cli/test/cli.test.ts` that runs `runCli(["agent", "setup"])` in a temp directory and expects project-local files for Codex, Claude Code, and Cursor to be created.
- [ ] Step 2: Add a failing test that runs `runCli(["agent", "setup", "--dry-run"])` and expects preview output with no files written.
- [ ] Step 3: Add a failing test that runs `runCli(["agent", "setup", "--tool", "codex"])` and expects only Codex targets to be generated.
- [ ] Step 4: Run `pnpm test -- --run packages/cli/test/cli.test.ts` and verify the new CLI tests fail because the command does not exist yet.
- [ ] Step 5: Implement `agent setup` argument handling in `packages/cli/src/index.ts`.
- [ ] Step 6: Integrate the CLI with `packages/cli/src/agent/bootstrap.ts` so normal runs write files and dry runs only print the plan.
- [ ] Step 7: Run `pnpm test -- --run packages/cli/test/cli.test.ts` and verify the new CLI tests pass.

### Task 4: Add backup and reporting coverage

**Files:**
- Modify: `packages/cli/test/agent-setup.test.ts`
- Modify: `packages/cli/test/cli.test.ts`
- Modify: `packages/cli/src/agent/files.ts`
- Modify: `packages/cli/src/agent/bootstrap.ts`

- [ ] Step 1: Add a failing test that expects existing repo files to be backed up before mutation.
- [ ] Step 2: Add a failing test that expects CLI output to include detected tools, changed files, and any remaining manual approval note.
- [ ] Step 3: Run `pnpm test -- --run packages/cli/test/agent-setup.test.ts packages/cli/test/cli.test.ts` and verify the new tests fail.
- [ ] Step 4: Implement backup creation and structured result reporting in `packages/cli/src/agent/files.ts` and `packages/cli/src/agent/bootstrap.ts`.
- [ ] Step 5: Run `pnpm test -- --run packages/cli/test/agent-setup.test.ts packages/cli/test/cli.test.ts` and verify the backup and reporting tests pass.

## Chunk 3: Instruction Content

### Task 5: Add failing tests for GraphTrace instruction content quality

**Files:**
- Modify: `packages/cli/test/agent-setup.test.ts`
- Modify: `packages/cli/src/agent/templates.ts`

- [ ] Step 1: Add a failing test that expects all generated instruction files to mention the GraphTrace tool mapping: `search_code`, `get_symbol_context`, `get_dependencies`, `get_impact_analysis`, `get_data_flow`, `get_routes`, `get_status`, and `run_index`.
- [ ] Step 2: Add a failing test that expects the content to emphasize narrow queries first, status-before-reindex, and avoiding large raw dumps.
- [ ] Step 3: Run `pnpm test -- --run packages/cli/test/agent-setup.test.ts` and verify these content tests fail with the current minimal templates.
- [ ] Step 4: Refine the generated Codex skill, Claude memory block, and Cursor rule so they share core guidance but keep tool-specific phrasing.
- [ ] Step 5: Run `pnpm test -- --run packages/cli/test/agent-setup.test.ts` and verify the content tests pass.

## Chunk 4: Docs and Verification

### Task 6: Document the workflow in the README

**Files:**
- Modify: `README.md`
- Modify: `packages/cli/README.md`

- [ ] Step 1: Add a README section for `graphtrace agent setup`.
- [ ] Step 2: Document supported tools and generated files.
- [ ] Step 3: Document `--dry-run` and `--tool`.
- [ ] Step 4: Document any remaining native approval step per tool.
- [ ] Step 5: Review README wording so it matches actual command behavior and does not promise unsupported automation.

### Task 7: Final verification

**Files:**
- Modify: `docs/superpowers/plans/2026-04-06-agent-bootstrap.md`

- [ ] Step 1: Run `pnpm test -- --run packages/cli/test/agent-setup.test.ts packages/cli/test/cli.test.ts`.
- [ ] Step 2: Run `pnpm test`.
- [ ] Step 3: Run `pnpm typecheck`.
- [ ] Step 4: Run `pnpm lint`.
- [ ] Step 5: If any command fails, fix the issue and re-run the failed command before moving on.
