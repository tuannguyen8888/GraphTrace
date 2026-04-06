# Repo Governance Hygiene Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the lightweight GitHub governance setup for GraphTrace without adding heavy process overhead.

**Architecture:** Add repository-owned governance files in `.github/`, configure a small auto-label workflow, then update GitHub labels and merge the work into `main` through a pull request. After merge, fast-forward `dev` to the same commit so both mainline branches share one baseline.

**Tech Stack:** Git, GitHub CLI, GitHub Actions, Markdown, YAML

---

## Chunk 1: Repository Governance Files

### Task 1: Add ownership and issue intake config

**Files:**
- Create: `.github/CODEOWNERS`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/labeler.yml`
- Create: `.github/workflows/labeler.yml`

- [ ] Step 1: Add `CODEOWNERS` assigning the repository owner as the default reviewer.
- [ ] Step 2: Add issue template config that points contributors to docs and keeps intake structured.
- [ ] Step 3: Add a path-based labeler config that maps major repo areas to labels.
- [ ] Step 4: Add a workflow that applies labels to pull requests and incoming issues.
- [ ] Step 5: Review the YAML files for obvious schema or trigger mistakes.

## Chunk 2: Remote Metadata

### Task 2: Align GitHub labels and merge flow

**Files:**
- No in-repo file changes

- [ ] Step 1: Create any missing labels referenced by the labeler config.
- [ ] Step 2: Push the governance branch to origin.
- [ ] Step 3: Open a pull request into `main`.
- [ ] Step 4: Wait for the `verify` workflow to pass.
- [ ] Step 5: Merge the pull request into `main`.

## Chunk 3: Branch Alignment and Verification

### Task 3: Sync `dev` and verify repository state

**Files:**
- No new file changes

- [ ] Step 1: Fast-forward local `dev` to the merged `main` commit.
- [ ] Step 2: Push `dev` to origin.
- [ ] Step 3: Run `pnpm lint`.
- [ ] Step 4: Run `pnpm typecheck`.
- [ ] Step 5: Run `pnpm test`.
- [ ] Step 6: Verify `main` and `dev` on remote point at the expected commits and protection remains enabled for `main`.
