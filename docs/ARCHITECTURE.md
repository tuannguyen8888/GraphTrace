# Architecture

GraphTrace uses a graph-first local engine:

- index source code into a local SQLite graph store
- expose one query engine to CLI, MCP, and web UI
- keep semantic search optional and local-first by default

