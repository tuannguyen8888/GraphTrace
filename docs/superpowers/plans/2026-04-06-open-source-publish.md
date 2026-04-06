# Open Source Publish Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move GraphTrace to a standard open source collaboration flow with `main` as the protected default branch and clear contributor guidance.

**Architecture:** Keep the current code state intact, layer collaboration metadata into the repository, then configure GitHub so `main` acts as the stable integration branch. Verification relies on repository metadata checks plus the existing CI commands already defined by the workspace.

**Tech Stack:** Git, GitHub CLI, GitHub repository settings, Markdown docs, GitHub Actions

---

## Chunk 1: Repository Community Files

### Task 1: Add canonical contributor guidance and templates

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `.github/pull_request_template.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`
- Modify: `README.md`
- Modify: `docs/CONTRIBUTING.md`

- [ ] Step 1: Add a root `CONTRIBUTING.md` that explains branch strategy, local verification, and pull request expectations.
- [ ] Step 2: Add issue and pull request templates tailored to GraphTrace.
- [ ] Step 3: Update `README.md` to point contributors to the new workflow.
- [ ] Step 4: Replace the old lightweight `docs/CONTRIBUTING.md` with a pointer to the canonical root document.
- [ ] Step 5: Review the changed Markdown files for consistency and obvious mistakes.

## Chunk 2: Branch Model and GitHub Metadata

### Task 2: Promote `main` to the protected default branch

**Files:**
- No in-repo file changes

- [ ] Step 1: Create local `main` from the current `dev` commit.
- [ ] Step 2: Push `main` to `origin`.
- [ ] Step 3: Switch the GitHub default branch from `dev` to `main`.
- [ ] Step 4: Apply repository topics and branch protection so `main` requires pull requests and the `verify` check before merge.
- [ ] Step 5: Confirm the remote now exposes `main` as the public integration branch.

## Chunk 3: Verification

### Task 3: Verify local and remote state

**Files:**
- No new file changes

- [ ] Step 1: Run `pnpm lint`.
- [ ] Step 2: Run `pnpm typecheck`.
- [ ] Step 3: Run `pnpm test`.
- [ ] Step 4: Inspect `git status --short --branch`.
- [ ] Step 5: Inspect GitHub repo metadata to confirm visibility, default branch, topics, and branch protection state.
