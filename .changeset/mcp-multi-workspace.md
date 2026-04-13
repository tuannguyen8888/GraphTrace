---
"graphtrace": minor
"@graphtrace/mcp": minor
"@graphtrace/server": patch
---

Move GraphTrace MCP to the shared workspace registry so one MCP entry can query many indexed repos from the same GraphTrace home. Existing repo-local MCP startup still works as a legacy fallback when only a local `.graphtrace/index.db` is present, but generated Codex config no longer pins the MCP server to the repository `cwd`.

Add `graphtrace agent ... --scope user` so Codex, Claude Code, and Cursor can share one machine-level GraphTrace MCP setup instead of writing bootstrap files into every repository. Project scope stays the default, `--write-mode local` remains project-only, and user-scope restore state/backups are stored under the selected GraphTrace home.
