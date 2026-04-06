import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  DependencyDirection,
  GraphItem,
  IndexRunInfo,
  QueryResult,
  RouteItem,
  SearchItem,
} from "@graphtrace/shared";

const SCHEMA_VERSION = 2;

interface EdgeRow {
  type: string;
  source_id: string;
  target_id: string;
  confidence: number;
  metadata_json: string | null;
}

interface RouteRow {
  id: string;
  method: string;
  path: string;
  handler_name: string;
  handler_symbol_id: string;
  file_path: string;
  framework: string;
  confidence: number;
}

export class GraphStore {
  readonly db: DatabaseSync;

  constructor(readonly dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.ensureSchema();
  }

  close(): void {
    this.db.close();
  }

  reset(): void {
    this.db.exec(`
      DELETE FROM packages;
      DELETE FROM files;
      DELETE FROM symbols;
      DELETE FROM routes;
      DELETE FROM edges;
      DELETE FROM index_runs;
      DELETE FROM fts_content;
    `);
  }

  deleteFileArtifacts(filePath: string): void {
    const normalizedPath = filePath.replaceAll("\\", "/");
    const fileId = `file:${normalizedPath}`;
    const symbolIds = (
      this.db
        .prepare("SELECT id FROM symbols WHERE file_id = ?")
        .all(fileId) as Array<{ id: string }>
    ).map((row) => row.id);
    const routeIds = (
      this.db
        .prepare("SELECT id FROM routes WHERE file_path = ?")
        .all(normalizedPath) as Array<{ id: string }>
    ).map((row) => row.id);

    this.db.prepare("DELETE FROM fts_content WHERE id = ?").run(fileId);
    for (const symbolId of symbolIds) {
      this.db.prepare("DELETE FROM fts_content WHERE id = ?").run(symbolId);
    }
    for (const routeId of routeIds) {
      this.db.prepare("DELETE FROM fts_content WHERE id = ?").run(routeId);
    }

    this.db
      .prepare(
        "DELETE FROM edges WHERE source_id = ? OR target_id = ? OR target_id LIKE ?",
      )
      .run(fileId, fileId, `query:${normalizedPath}#%`);
    this.db
      .prepare("DELETE FROM routes WHERE file_path = ?")
      .run(normalizedPath);
    this.db.prepare("DELETE FROM symbols WHERE file_id = ?").run(fileId);
    this.db.prepare("DELETE FROM files WHERE id = ?").run(fileId);
  }

  beginIndexRun(mode: "full" | "incremental"): number {
    const startedAt = new Date().toISOString();
    const result = this.db
      .prepare(
        "INSERT INTO index_runs (mode, started_at, completed_at, summary_json) VALUES (?, ?, NULL, NULL)",
      )
      .run(mode, startedAt);
    return Number(result.lastInsertRowid);
  }

  completeIndexRun(indexRunId: number, summary: unknown): void {
    this.db
      .prepare(
        "UPDATE index_runs SET completed_at = ?, summary_json = ? WHERE id = ?",
      )
      .run(new Date().toISOString(), JSON.stringify(summary), indexRunId);
  }

  lastIndexRun(): IndexRunInfo | null {
    const row = this.db
      .prepare(
        "SELECT id, mode, started_at, completed_at, summary_json FROM index_runs ORDER BY id DESC LIMIT 1",
      )
      .get() as
      | {
          id: number;
          mode: "full" | "incremental";
          started_at: string;
          completed_at: string | null;
          summary_json: string | null;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      mode: row.mode,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      summary: row.summary_json ? JSON.parse(row.summary_json) : null,
    };
  }

  upsertPackage(record: { id: string; name: string; rootPath: string }): void {
    this.db
      .prepare(`
        INSERT INTO packages (id, name, root_path)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, root_path = excluded.root_path
      `)
      .run(record.id, record.name, record.rootPath);
    this.upsertSearchEntry({
      kind: "package",
      id: record.id,
      text: `${record.name} ${record.rootPath}`,
      path: record.rootPath,
    });
  }

  upsertFile(record: {
    id: string;
    path: string;
    packageId: string;
    hash: string;
  }): void {
    this.db
      .prepare(`
        INSERT INTO files (id, path, package_id, hash, tsconfig_context)
        VALUES (?, ?, ?, ?, '')
        ON CONFLICT(id) DO UPDATE SET path = excluded.path, package_id = excluded.package_id, hash = excluded.hash
      `)
      .run(record.id, record.path, record.packageId, record.hash);
    this.upsertSearchEntry({
      kind: "file",
      id: record.id,
      text: record.path,
      path: record.path,
    });
  }

  upsertSymbol(record: {
    id: string;
    name: string;
    kind: string;
    fileId: string;
    filePath: string;
    exported: boolean;
  }): void {
    this.db
      .prepare(`
        INSERT INTO symbols (id, name, kind, file_id, exported)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, file_id = excluded.file_id, exported = excluded.exported
      `)
      .run(
        record.id,
        record.name,
        record.kind,
        record.fileId,
        record.exported ? 1 : 0,
      );
    this.upsertSearchEntry({
      kind: "symbol",
      id: record.id,
      text: `${record.name} ${record.kind} ${record.filePath}`,
      path: record.filePath,
    });
  }

  upsertRoute(record: RouteItem): void {
    this.db
      .prepare(`
        INSERT INTO routes (id, method, path, handler_name, handler_symbol_id, file_path, framework, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          method = excluded.method,
          path = excluded.path,
          handler_name = excluded.handler_name,
          handler_symbol_id = excluded.handler_symbol_id,
          file_path = excluded.file_path,
          framework = excluded.framework,
          confidence = excluded.confidence
      `)
      .run(
        record.id,
        record.method,
        record.path,
        record.handlerName,
        record.handlerSymbolId,
        record.filePath,
        record.framework,
        record.confidence,
      );
    this.upsertSearchEntry({
      kind: "route",
      id: record.id,
      text: `${record.method} ${record.path} ${record.handlerName}`,
      path: record.filePath,
    });
  }

  insertEdge(record: {
    id: string;
    type: string;
    sourceId: string;
    sourceKind: string;
    targetId: string;
    targetKind: string;
    confidence: number;
    metadata?: unknown;
  }): void {
    this.db
      .prepare(`
        INSERT INTO edges (id, type, source_id, source_kind, target_id, target_kind, confidence, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          type = excluded.type,
          source_id = excluded.source_id,
          source_kind = excluded.source_kind,
          target_id = excluded.target_id,
          target_kind = excluded.target_kind,
          confidence = excluded.confidence,
          metadata_json = excluded.metadata_json
      `)
      .run(
        record.id,
        record.type,
        record.sourceId,
        record.sourceKind,
        record.targetId,
        record.targetKind,
        record.confidence,
        record.metadata ? JSON.stringify(record.metadata) : null,
      );
  }

  upsertSearchEntry(record: {
    kind: string;
    id: string;
    text: string;
    path: string;
  }): void {
    this.db.prepare("DELETE FROM fts_content WHERE id = ?").run(record.id);
    this.db
      .prepare(
        "INSERT INTO fts_content (kind, id, text, path) VALUES (?, ?, ?, ?)",
      )
      .run(record.kind, record.id, record.text, record.path);
  }

  search(query: string, kind?: string): QueryResult<SearchItem> {
    const rows = this.db
      .prepare(`
        SELECT kind, id, path, text
        FROM fts_content
        WHERE text LIKE ?
          AND (? IS NULL OR kind = ?)
        ORDER BY
          CASE kind
            WHEN 'symbol' THEN 0
            WHEN 'route' THEN 1
            WHEN 'file' THEN 2
            ELSE 3
          END,
          text
        LIMIT 20
      `)
      .all(`%${query}%`, kind ?? null, kind ?? null) as Array<{
      kind: string;
      id: string;
      path: string | null;
      text: string;
    }>;

    return {
      items: rows.map((row, index) => ({
        id: row.id,
        kind: row.kind,
        label: row.text,
        path: row.path ?? undefined,
        score: 100 - index,
      })),
    };
  }

  routes(packageName?: string): QueryResult<RouteItem> {
    const rows = this.db
      .prepare("SELECT * FROM routes ORDER BY method, path")
      .all() as unknown as RouteRow[];
    const items = rows.map((row) => this.mapRouteRow(row));

    if (!packageName) {
      return { items };
    }

    const matchingPackage = this.db
      .prepare("SELECT root_path FROM packages WHERE name = ?")
      .get(packageName) as { root_path: string } | undefined;

    return {
      items: items.filter((item) =>
        matchingPackage
          ? item.filePath === matchingPackage.root_path ||
            item.filePath.startsWith(`${matchingPackage.root_path}/`)
          : false,
      ),
    };
  }

  routeById(routeId: string): RouteItem | null {
    const row = this.db
      .prepare("SELECT * FROM routes WHERE id = ?")
      .get(routeId) as RouteRow | undefined;
    if (!row) {
      return null;
    }
    return this.mapRouteRow(row);
  }

  private mapRouteRow(row: RouteRow): RouteItem {
    return {
      id: row.id,
      method: row.method,
      path: row.path,
      handlerName: row.handler_name,
      handlerSymbolId: row.handler_symbol_id,
      filePath: row.file_path,
      framework: row.framework,
      confidence: row.confidence,
    };
  }

  fileDependencies(
    targetPath: string,
    direction: DependencyDirection = "both",
    maxDepth = 1,
  ): QueryResult<GraphItem> {
    const targetId = `file:${targetPath}`;
    const items = new Map<string, GraphItem>();
    const rows = this.db
      .prepare("SELECT * FROM edges WHERE type = 'imports'")
      .all() as unknown as EdgeRow[];
    const outboundEdges = new Map<
      string,
      Array<{ id: string; confidence: number }>
    >();
    const inboundEdges = new Map<
      string,
      Array<{ id: string; confidence: number }>
    >();

    for (const row of rows) {
      if (
        row.source_id.startsWith("file:") &&
        row.target_id.startsWith("file:")
      ) {
        outboundEdges.set(row.source_id, [
          ...(outboundEdges.get(row.source_id) ?? []),
          { id: row.target_id, confidence: row.confidence },
        ]);
        inboundEdges.set(row.target_id, [
          ...(inboundEdges.get(row.target_id) ?? []),
          { id: row.source_id, confidence: row.confidence },
        ]);
      }
    }

    const collect = (
      adjacency: Map<string, Array<{ id: string; confidence: number }>>,
    ) => {
      const visited = new Set<string>([targetId]);
      const queue: Array<{ id: string; depth: number }> = [
        { id: targetId, depth: 0 },
      ];

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current || current.depth >= maxDepth) {
          continue;
        }

        for (const next of adjacency.get(current.id) ?? []) {
          if (visited.has(next.id)) {
            continue;
          }

          visited.add(next.id);
          queue.push({ id: next.id, depth: current.depth + 1 });
          items.set(next.id, this.toFileGraphItem(next.id, next.confidence));
        }
      }
    };

    if (direction === "out" || direction === "both") {
      collect(outboundEdges);
    }

    if (direction === "in" || direction === "both") {
      collect(inboundEdges);
    }

    return { items: [...items.values()] };
  }

  impactFromPath(targetPath: string, maxDepth = 6): QueryResult<GraphItem> {
    const startId = `file:${targetPath}`;
    const edges = this.db
      .prepare("SELECT * FROM edges WHERE type = 'imports'")
      .all() as unknown as EdgeRow[];
    const reverseMap = new Map<string, string[]>();
    for (const edge of edges) {
      const current = reverseMap.get(edge.target_id) ?? [];
      current.push(edge.source_id);
      reverseMap.set(edge.target_id, current);
    }

    const visited = new Set<string>([startId]);
    const queue: Array<{ id: string; depth: number }> = [
      { id: startId, depth: 0 },
    ];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || current.depth >= maxDepth) {
        continue;
      }
      for (const dependent of reverseMap.get(current.id) ?? []) {
        if (visited.has(dependent)) {
          continue;
        }
        visited.add(dependent);
        queue.push({ id: dependent, depth: current.depth + 1 });
      }
    }

    const items: GraphItem[] = [];
    for (const id of visited) {
      if (id.startsWith("file:") && id !== startId) {
        const path = id.slice("file:".length);
        items.push({ id, kind: "file", label: path, path });
      }
    }

    const routes = this.routes().items.filter(
      (route) =>
        visited.has(`file:${route.filePath}`) ||
        visited.has(route.handlerSymbolId),
    );
    for (const route of routes) {
      items.push({
        id: route.id,
        kind: "route",
        label: `${route.method} ${route.path}`,
        path: route.filePath,
        confidence: route.confidence,
      });
    }

    return { items };
  }

  flowFromRoute(routeId: string, maxDepth = 6): QueryResult<GraphItem> {
    const route = this.routeById(routeId);
    if (!route) {
      return { items: [] };
    }

    const startIds = new Set<string>([`file:${route.filePath}`]);
    if (route.handlerSymbolId) {
      const statement = this.db
        .prepare("SELECT file_id FROM symbols WHERE id = ?")
        .get(route.handlerSymbolId) as { file_id: string } | undefined;
      if (statement) {
        startIds.add(statement.file_id);
      }
    }

    const edges = this.db
      .prepare("SELECT * FROM edges")
      .all() as unknown as EdgeRow[];
    const importMap = new Map<string, string[]>();
    const queryMap = new Map<string, GraphItem[]>();

    for (const edge of edges) {
      if (edge.type === "imports") {
        const current = importMap.get(edge.source_id) ?? [];
        current.push(edge.target_id);
        importMap.set(edge.source_id, current);
      }
      if (edge.type === "queries") {
        const current = queryMap.get(edge.source_id) ?? [];
        const metadata = edge.metadata_json
          ? JSON.parse(edge.metadata_json)
          : {};
        current.push({
          id: edge.target_id,
          kind: "query",
          label: metadata.label ?? edge.target_id,
          path: metadata.filePath,
          confidence: edge.confidence,
        });
        queryMap.set(edge.source_id, current);
      }
    }

    const visited = new Set<string>();
    const items: GraphItem[] = [
      {
        id: route.id,
        kind: "route",
        label: `${route.method} ${route.path}`,
        path: route.filePath,
        confidence: route.confidence,
      },
    ];
    const queue = [...startIds].map((id) => ({ id, depth: 0 }));

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current.id) || current.depth > maxDepth) {
        continue;
      }
      visited.add(current.id);

      if (current.id.startsWith("file:")) {
        const path = current.id.slice("file:".length);
        items.push({ id: current.id, kind: "file", label: path, path });
      }

      for (const query of queryMap.get(current.id) ?? []) {
        items.push(query);
      }

      for (const nextId of importMap.get(current.id) ?? []) {
        if (!visited.has(nextId)) {
          queue.push({ id: nextId, depth: current.depth + 1 });
        }
      }
    }

    return { items };
  }

  packageOverview(): QueryResult<GraphItem> {
    const rows = this.db
      .prepare("SELECT id, name, root_path FROM packages ORDER BY name")
      .all() as Array<{
      id: string;
      name: string;
      root_path: string;
    }>;
    return {
      items: rows.map((row) => ({
        id: row.id,
        kind: "package",
        label: row.name,
        path: row.root_path,
      })),
    };
  }

  listIndexedFilePaths(): string[] {
    return (
      this.db.prepare("SELECT path FROM files ORDER BY path").all() as Array<{
        path: string;
      }>
    ).map((row) => row.path);
  }

  private toFileGraphItem(id: string, confidence?: number): GraphItem {
    const path = id.slice("file:".length);
    return {
      id,
      kind: "file",
      label: path,
      path,
      confidence,
    };
  }

  stats(): {
    packageCount: number;
    fileCount: number;
    symbolCount: number;
    routeCount: number;
    queryEdgeCount: number;
  } {
    const getCount = (table: string, clause = "") =>
      Number(
        (
          this.db
            .prepare(`SELECT COUNT(*) as count FROM ${table}${clause}`)
            .get() as { count: number }
        ).count,
      );

    return {
      packageCount: getCount("packages"),
      fileCount: getCount("files"),
      symbolCount: getCount("symbols"),
      routeCount: getCount("routes"),
      queryEdgeCount: getCount("edges", " WHERE type = 'queries'"),
    };
  }

  private ensureSchema(): void {
    const currentVersion = (
      this.db.prepare("PRAGMA user_version").get() as { user_version: number }
    ).user_version;

    if (currentVersion !== SCHEMA_VERSION) {
      this.db.exec(`
        DROP TABLE IF EXISTS packages;
        DROP TABLE IF EXISTS files;
        DROP TABLE IF EXISTS symbols;
        DROP TABLE IF EXISTS routes;
        DROP TABLE IF EXISTS edges;
        DROP TABLE IF EXISTS index_runs;
        DROP TABLE IF EXISTS fts_content;
      `);
    }

    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS packages (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        package_id TEXT NOT NULL,
        hash TEXT NOT NULL,
        tsconfig_context TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS symbols (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        file_id TEXT NOT NULL,
        exported INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS routes (
        id TEXT PRIMARY KEY,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        handler_name TEXT NOT NULL,
        handler_symbol_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        framework TEXT NOT NULL,
        confidence REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        target_id TEXT NOT NULL,
        target_kind TEXT NOT NULL,
        confidence REAL NOT NULL,
        metadata_json TEXT
      );

      CREATE TABLE IF NOT EXISTS index_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mode TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        summary_json TEXT
      );

      CREATE TABLE IF NOT EXISTS fts_content (
        kind TEXT NOT NULL,
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        path TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_fts_content_kind
        ON fts_content (kind);

      CREATE INDEX IF NOT EXISTS idx_fts_content_path
        ON fts_content (path);

      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  }
}

export function openGraphStore(dbPath: string): GraphStore {
  return new GraphStore(dbPath);
}
