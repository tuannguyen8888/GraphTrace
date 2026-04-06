# README and Community Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition GraphTrace clearly for open source readers with a fuller README and finish the remaining community-facing repo documents.

**Architecture:** Keep the product messaging honest to the current implementation: GraphTrace is a local-first code graph for JS/TS monorepos with CLI, MCP, and web surfaces. Add the missing community docs and small GitHub repo settings that support open source adoption without changing runtime code.

**Tech Stack:** Markdown, GitHub repository settings, Git, GitHub CLI

---

## Chunk 1: Product Positioning

### Task 1: Rewrite README around a hybrid product/technical story

**Files:**
- Modify: `README.md`
- Create: `docs/superpowers/plans/2026-04-06-readme-community-polish.md`

- [ ] Step 1: Rewrite the README opening so it states what GraphTrace is in plain language.
- [ ] Step 2: Add sections for problem statement, intended users, and concrete use cases.
- [ ] Step 3: Add a capabilities and architecture section that matches the current codebase truthfully.
- [ ] Step 4: Add quick start, CLI examples, and links to roadmap/architecture/contributing.
- [ ] Step 5: Review for clarity, repetition, and factual consistency with the repo.

## Chunk 2: Community Docs

### Task 2: Add missing open source support documents

**Files:**
- Create: `SECURITY.md`
- Create: `SUPPORT.md`

- [ ] Step 1: Add a security policy with a responsible disclosure path.
- [ ] Step 2: Add a support guide that explains where to ask questions and where to file bugs or feature requests.
- [ ] Step 3: Link these documents from the README where appropriate.

## Chunk 3: Repo Settings and Verification

### Task 3: Enable remaining community-facing repo options and merge

**Files:**
- No new code files

- [ ] Step 1: Enable GitHub Discussions if it is not already enabled.
- [ ] Step 2: Run `pnpm lint`.
- [ ] Step 3: Run `pnpm typecheck`.
- [ ] Step 4: Run `pnpm test`.
- [ ] Step 5: Push the branch, open a PR into `main`, wait for `verify`, and merge after it passes.
