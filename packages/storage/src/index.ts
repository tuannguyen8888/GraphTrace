import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  DependencyDirection,
  DiscoveredUnit,
  GraphConfidenceLabel,
  GraphEdgeDescriptor,
  GraphEdgeProvenance,
  GraphEnvelope,
  GraphItem,
  IndexRunInfo,
  IndexSummary,
  QueryResult,
  RepositorySummary,
  RouteItem,
  SearchItem,
  SourceSpan,
  SymbolDescriptor,
} from "@graphtrace/shared";
import {
  createGraphEnvelope,
  deriveRepositories,
  pathBelongsToRepository,
} from "@graphtrace/shared";

const SCHEMA_VERSION = 5;

interface EdgeRow {
  id: string;
  type: GraphEdgeDescriptor["type"];
  source_id: string;
  source_kind: string;
  target_id: string;
  target_kind: string;
  confidence: number;
  confidence_label: GraphConfidenceLabel;
  provenance_json: string | null;
  metadata_json: string | null;
}

interface SymbolRow {
  id: string;
  name: string;
  display_name: string;
  kind: string;
  language: SymbolDescriptor["language"];
  file_id: string;
  file_path: string;
  exported: number;
  owner_symbol_id: string | null;
  owner_kind: string | null;
  signature_text: string | null;
  framework_role: string | null;
  span_start_line: number | null;
  span_start_column: number | null;
  span_end_line: number | null;
  span_end_column: number | null;
}

interface RouteRow {
  storage_id?: string;
  id: string;
  method: string;
  path: string;
  handler_name: string;
  handler_symbol_id: string;
  file_path: string;
  framework: string;
  unit_id: string;
  confidence: number;
  metadata_json: string | null;
}

export interface GraphStoreOptions {
  readOnly?: boolean;
  timeout?: number;
}

export class GraphStore {
  readonly db: DatabaseSync;

  constructor(
    readonly dbPath: string,
    private readonly options: GraphStoreOptions = {},
  ) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath, {
      readOnly: options.readOnly ?? false,
      timeout: options.timeout ?? 0,
    });

    if (options.readOnly) {
      return;
    }

    this.ensureSchema();
  }

  close(): void {
    this.db.close();
  }

  reset(): void {
    this.db.exec(`
      DELETE FROM packages;
      DELETE FROM units;
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
        .prepare("SELECT storage_id FROM routes WHERE file_path = ?")
        .all(normalizedPath) as Array<{ storage_id: string }>
    ).map((row) => row.storage_id);

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

  upsertUnit(record: DiscoveredUnit): void {
    this.db
      .prepare(`
        INSERT INTO units (
          id,
          root_path,
          display_name,
          kind,
          language,
          tooling,
          indexing_mode,
          confidence,
          parent_unit_id,
          signals_json,
          source_roots_json,
          plugin_matches_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          root_path = excluded.root_path,
          display_name = excluded.display_name,
          kind = excluded.kind,
          language = excluded.language,
          tooling = excluded.tooling,
          indexing_mode = excluded.indexing_mode,
          confidence = excluded.confidence,
          parent_unit_id = excluded.parent_unit_id,
          signals_json = excluded.signals_json,
          source_roots_json = excluded.source_roots_json,
          plugin_matches_json = excluded.plugin_matches_json
      `)
      .run(
        record.id,
        record.rootPath,
        record.displayName,
        record.kind,
        record.language,
        record.tooling,
        record.indexingMode,
        record.confidence,
        record.parentUnitId ?? null,
        JSON.stringify(record.signals),
        JSON.stringify(record.sourceRoots),
        JSON.stringify(record.pluginMatches),
      );
  }

  units(): DiscoveredUnit[] {
    return (
      this.db.prepare("SELECT * FROM units ORDER BY root_path").all() as Array<{
        id: string;
        root_path: string;
        display_name: string;
        kind: DiscoveredUnit["kind"];
        language: DiscoveredUnit["language"];
        tooling: string;
        indexing_mode: DiscoveredUnit["indexingMode"];
        confidence: number;
        parent_unit_id: string | null;
        signals_json: string;
        source_roots_json: string;
        plugin_matches_json: string;
      }>
    ).map((row) => ({
      id: row.id,
      rootPath: row.root_path,
      displayName: row.display_name,
      kind: row.kind,
      language: row.language,
      tooling: row.tooling,
      indexingMode: row.indexing_mode,
      confidence: row.confidence,
      parentUnitId: row.parent_unit_id ?? undefined,
      signals: JSON.parse(row.signals_json),
      sourceRoots: JSON.parse(row.source_roots_json),
      pluginMatches: JSON.parse(row.plugin_matches_json),
    }));
  }

  upsertPackage(record: {
    id: string;
    name: string;
    rootPath: string;
    unitId: string;
  }): void {
    this.db
      .prepare(`
        INSERT INTO packages (id, name, root_path, unit_id)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          root_path = excluded.root_path,
          unit_id = excluded.unit_id
      `)
      .run(record.id, record.name, record.rootPath, record.unitId);
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
    unitId: string;
    hash: string;
  }): void {
    this.db
      .prepare(`
        INSERT INTO files (id, path, package_id, unit_id, hash, tsconfig_context)
        VALUES (?, ?, ?, ?, ?, '')
        ON CONFLICT(id) DO UPDATE SET
          path = excluded.path,
          package_id = excluded.package_id,
          unit_id = excluded.unit_id,
          hash = excluded.hash
      `)
      .run(
        record.id,
        record.path,
        record.packageId,
        record.unitId,
        record.hash,
      );
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
    displayName?: string;
    kind: string;
    language?: SymbolDescriptor["language"];
    fileId: string;
    filePath: string;
    exported: boolean;
    ownerSymbolId?: string;
    ownerKind?: string;
    signatureText?: string;
    frameworkRole?: string;
    span?: SourceSpan;
  }): void {
    this.db
      .prepare(`
        INSERT INTO symbols (
          id,
          name,
          display_name,
          kind,
          language,
          file_id,
          file_path,
          exported,
          owner_symbol_id,
          owner_kind,
          signature_text,
          framework_role,
          span_start_line,
          span_start_column,
          span_end_line,
          span_end_column
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          display_name = excluded.display_name,
          kind = excluded.kind,
          language = excluded.language,
          file_id = excluded.file_id,
          file_path = excluded.file_path,
          exported = excluded.exported,
          owner_symbol_id = excluded.owner_symbol_id,
          owner_kind = excluded.owner_kind,
          signature_text = excluded.signature_text,
          framework_role = excluded.framework_role,
          span_start_line = excluded.span_start_line,
          span_start_column = excluded.span_start_column,
          span_end_line = excluded.span_end_line,
          span_end_column = excluded.span_end_column
      `)
      .run(
        record.id,
        record.name,
        record.displayName ?? record.name,
        record.kind,
        record.language ?? "unknown",
        record.fileId,
        record.filePath,
        record.exported ? 1 : 0,
        record.ownerSymbolId ?? null,
        record.ownerKind ?? null,
        record.signatureText ?? null,
        record.frameworkRole ?? null,
        record.span?.startLine ?? null,
        record.span?.startColumn ?? null,
        record.span?.endLine ?? null,
        record.span?.endColumn ?? null,
      );
    this.upsertSearchEntry({
      kind: "symbol",
      id: record.id,
      text: `${record.displayName ?? record.name} ${record.kind} ${record.filePath}`,
      path: record.filePath,
    });
  }

  symbolById(symbolId: string): SymbolDescriptor | null {
    const row = this.db
      .prepare("SELECT * FROM symbols WHERE id = ?")
      .get(symbolId) as SymbolRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapSymbolRow(row);
  }

  symbolByFileAndName(
    filePath: string,
    symbolName: string,
  ): SymbolDescriptor | null {
    const row = this.db
      .prepare(
        `SELECT *
         FROM symbols
         WHERE file_path = ?
           AND (name = ? OR display_name = ?)
         ORDER BY exported DESC, span_start_line ASC
         LIMIT 1`,
      )
      .get(filePath, symbolName, symbolName) as SymbolRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapSymbolRow(row);
  }

  symbolByFilePosition(
    filePath: string,
    line: number,
    column: number,
  ): SymbolDescriptor | null {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM symbols
         WHERE file_path = ?
           AND span_start_line IS NOT NULL
           AND span_start_column IS NOT NULL
           AND span_end_line IS NOT NULL
           AND span_end_column IS NOT NULL
           AND (
             span_start_line < ?
             OR (span_start_line = ? AND span_start_column <= ?)
           )
           AND (
             span_end_line > ?
             OR (span_end_line = ? AND span_end_column >= ?)
           )`,
      )
      .all(
        filePath,
        line,
        line,
        column,
        line,
        line,
        column,
      ) as unknown as SymbolRow[];

    const match = rows
      .map((row) => this.mapSymbolRow(row))
      .sort((left, right) => symbolSpanSize(left) - symbolSpanSize(right))[0];

    return match ?? null;
  }

  upsertRoute(record: RouteItem): void {
    const storageId = routeStorageId(record.id, record.filePath);
    this.db
      .prepare(`
        INSERT INTO routes (
          storage_id,
          id,
          method,
          path,
          handler_name,
          handler_symbol_id,
          file_path,
          framework,
          unit_id,
          confidence,
          metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(storage_id) DO UPDATE SET
          method = excluded.method,
          path = excluded.path,
          handler_name = excluded.handler_name,
          handler_symbol_id = excluded.handler_symbol_id,
          file_path = excluded.file_path,
          framework = excluded.framework,
          unit_id = excluded.unit_id,
          confidence = excluded.confidence,
          metadata_json = excluded.metadata_json
      `)
      .run(
        storageId,
        record.id,
        record.method,
        record.path,
        record.handlerName,
        record.handlerSymbolId,
        record.filePath,
        record.framework,
        record.unitId,
        record.confidence,
        record.provenance ? JSON.stringify(record.provenance) : null,
      );
    this.upsertSearchEntry({
      kind: "route",
      id: storageId,
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
    confidenceLabel?: GraphConfidenceLabel;
    provenance?: GraphEdgeProvenance;
    metadata?: unknown;
  }): void {
    this.db
      .prepare(`
        INSERT INTO edges (
          id,
          type,
          source_id,
          source_kind,
          target_id,
          target_kind,
          confidence,
          confidence_label,
          provenance_json,
          metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          type = excluded.type,
          source_id = excluded.source_id,
          source_kind = excluded.source_kind,
          target_id = excluded.target_id,
          target_kind = excluded.target_kind,
          confidence = excluded.confidence,
          confidence_label = excluded.confidence_label,
          provenance_json = excluded.provenance_json,
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
        record.confidenceLabel ?? this.deriveConfidenceLabel(record.confidence),
        record.provenance ? JSON.stringify(record.provenance) : null,
        record.metadata ? JSON.stringify(record.metadata) : null,
      );
  }

  upsertSymbolEdge(record: GraphEdgeDescriptor): void {
    this.insertEdge({
      id: record.id,
      type: record.type,
      sourceId: record.sourceId,
      sourceKind: record.sourceKind,
      targetId: record.targetId,
      targetKind: record.targetKind,
      confidence: record.confidence,
      confidenceLabel: record.confidenceLabel,
      provenance: record.provenance,
      metadata: record.metadata,
    });
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
    const graph = this.emptyGraphEnvelope();

    return {
      items: rows.map((row, index) => ({
        id: row.kind === "route" ? canonicalRouteId(row.id) : row.id,
        kind: row.kind,
        label: row.text,
        path: row.path ?? undefined,
        score: 100 - index,
      })),
      graph,
    };
  }

  searchByRepository(
    repositoryId: string,
    query: string,
    kind?: string,
  ): QueryResult<SearchItem> {
    const repositories = this.repositories();
    const result = this.search(query, kind);
    return {
      items: result.items.filter((item) =>
        pathBelongsToRepository(item.path, repositoryId, repositories),
      ),
      graph: result.graph,
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

  routesByRepository(
    repositoryId: string,
    packageName?: string,
  ): QueryResult<RouteItem> {
    const repositories = this.repositories();
    return {
      items: this.routes(packageName).items.filter((item) =>
        pathBelongsToRepository(item.filePath, repositoryId, repositories),
      ),
    };
  }

  routeById(routeId: string): RouteItem | null {
    const row = this.db
      .prepare(
        "SELECT * FROM routes WHERE storage_id = ? OR id = ? ORDER BY CASE WHEN storage_id = ? THEN 0 ELSE 1 END, file_path LIMIT 1",
      )
      .get(routeId, routeId, routeId) as RouteRow | undefined;
    if (!row) {
      return null;
    }
    return this.mapRouteRow(row);
  }

  routesMatchingId(routeId: string): RouteItem[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM routes WHERE storage_id = ? OR id = ? ORDER BY file_path",
      )
      .all(routeId, routeId) as unknown as RouteRow[];
    return rows.map((row) => this.mapRouteRow(row));
  }

  symbolNeighbors(symbolId: string): GraphEnvelope {
    const rows = this.db
      .prepare(
        "SELECT * FROM edges WHERE source_id = ? OR target_id = ? ORDER BY id",
      )
      .all(symbolId, symbolId) as unknown as EdgeRow[];
    const nodes = new Map<string, GraphItem>();
    const edges = rows.map((row) => this.mapEdgeRow(row));

    const addNode = (nodeId: string, nodeKindHint?: string) => {
      if (nodes.has(nodeId)) {
        return;
      }

      nodes.set(nodeId, this.graphNodeById(nodeId, nodeKindHint));
    };

    addNode(symbolId, "symbol");
    for (const edge of edges) {
      addNode(edge.sourceId, edge.sourceKind);
      addNode(edge.targetId, edge.targetKind);
    }

    const confidence = edges.reduce<
      Partial<Record<GraphConfidenceLabel, number>>
    >((counts, edge) => {
      counts[edge.confidenceLabel] = (counts[edge.confidenceLabel] ?? 0) + 1;
      return counts;
    }, {});

    return createGraphEnvelope({
      nodes: [...nodes.values()],
      edges,
      summary: {
        nodeCount: nodes.size,
        edgeCount: edges.length,
        rootNodeIds: [symbolId],
        confidence,
      },
    });
  }

  executionContextFromSymbol(
    symbolId: string,
    options?: { maxNodes?: number; maxEdges?: number },
  ): GraphEnvelope {
    return this.traverseSymbolGraph(symbolId, options);
  }

  impactFromSymbol(
    symbolId: string,
    options?: { maxNodes?: number; maxEdges?: number },
  ): GraphEnvelope {
    return this.traverseSymbolGraph(symbolId, options);
  }

  explainEdge(edgeId: string): GraphEdgeDescriptor | null {
    const row = this.db
      .prepare("SELECT * FROM edges WHERE id = ?")
      .get(edgeId) as EdgeRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapEdgeRow(row);
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
      unitId: row.unit_id,
      confidence: row.confidence,
      provenance: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    };
  }

  private mapSymbolRow(row: SymbolRow): SymbolDescriptor {
    return {
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      kind: row.kind,
      language: row.language,
      fileId: row.file_id,
      filePath: row.file_path,
      exported: row.exported === 1,
      ownerSymbolId: row.owner_symbol_id ?? undefined,
      ownerKind: row.owner_kind ?? undefined,
      signatureText: row.signature_text ?? undefined,
      frameworkRole: row.framework_role ?? undefined,
      span: this.mapSpan(row),
    };
  }

  private mapSpan(row: SymbolRow): SourceSpan | undefined {
    if (
      row.span_start_line == null ||
      row.span_start_column == null ||
      row.span_end_line == null ||
      row.span_end_column == null
    ) {
      return undefined;
    }

    return {
      startLine: row.span_start_line,
      startColumn: row.span_start_column,
      endLine: row.span_end_line,
      endColumn: row.span_end_column,
    };
  }

  private mapEdgeRow(row: EdgeRow): GraphEdgeDescriptor {
    return {
      id: row.id,
      type: row.type,
      sourceId: row.source_id,
      sourceKind: row.source_kind,
      targetId: row.target_id,
      targetKind: row.target_kind,
      confidence: row.confidence,
      confidenceLabel: row.confidence_label,
      provenance: row.provenance_json
        ? JSON.parse(row.provenance_json)
        : undefined,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    };
  }

  private traverseSymbolGraph(
    rootId: string,
    options?: { maxNodes?: number; maxEdges?: number },
  ): GraphEnvelope {
    const maxNodes = options?.maxNodes ?? 25;
    const maxEdges = options?.maxEdges ?? 40;
    const rows = this.db
      .prepare(
        "SELECT * FROM edges WHERE type IN ('routes_to', 'calls', 'references', 'queries')",
      )
      .all() as unknown as EdgeRow[];
    const outgoing = new Map<string, EdgeRow[]>();
    const incoming = new Map<string, EdgeRow[]>();

    for (const row of rows) {
      outgoing.set(row.source_id, [
        ...(outgoing.get(row.source_id) ?? []),
        row,
      ]);
      incoming.set(row.target_id, [
        ...(incoming.get(row.target_id) ?? []),
        row,
      ]);
    }

    const nodes = new Map<string, GraphItem>([
      [rootId, this.graphNodeById(rootId, "symbol")],
    ]);
    const edges = new Map<string, GraphEdgeDescriptor>();
    const confidence: Partial<Record<GraphConfidenceLabel, number>> = {};
    const truncated = {
      nodeLimitReached: false,
      edgeLimitReached: false,
      omittedNodeCount: 0,
      omittedEdgeCount: 0,
    };

    const expand = (
      adjacency: Map<string, EdgeRow[]>,
      nextNodeForEdge: (row: EdgeRow) => { id: string; kind: string },
    ) => {
      const queue = [rootId];
      const visited = new Set<string>([rootId]);

      while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId) {
          continue;
        }

        for (const row of adjacency.get(currentId) ?? []) {
          const nextNode = nextNodeForEdge(row);

          if (!nodes.has(nextNode.id)) {
            if (nodes.size >= maxNodes) {
              truncated.nodeLimitReached = true;
              truncated.omittedNodeCount += 1;
              continue;
            }

            nodes.set(
              nextNode.id,
              this.graphNodeById(nextNode.id, nextNode.kind),
            );
          }

          if (!edges.has(row.id)) {
            if (edges.size >= maxEdges) {
              truncated.edgeLimitReached = true;
              truncated.omittedEdgeCount += 1;
              continue;
            }

            const edge = this.mapEdgeRow(row);
            edges.set(edge.id, edge);
            confidence[edge.confidenceLabel] =
              (confidence[edge.confidenceLabel] ?? 0) + 1;
          }

          if (nextNode.kind === "symbol" && !visited.has(nextNode.id)) {
            visited.add(nextNode.id);
            queue.push(nextNode.id);
          }
        }
      }
    };

    expand(incoming, (row) => ({
      id: row.source_id,
      kind: row.source_kind,
    }));
    expand(outgoing, (row) => ({
      id: row.target_id,
      kind: row.target_kind,
    }));

    return createGraphEnvelope({
      nodes: [...nodes.values()],
      edges: [...edges.values()],
      summary: {
        nodeCount: nodes.size,
        edgeCount: edges.size,
        rootNodeIds: [rootId],
        confidence,
        truncated:
          truncated.nodeLimitReached || truncated.edgeLimitReached
            ? truncated
            : undefined,
      },
    });
  }

  private graphNodeById(nodeId: string, nodeKindHint?: string): GraphItem {
    if (nodeId.startsWith("symbol:")) {
      const symbol = this.symbolById(nodeId);
      if (symbol) {
        return {
          id: symbol.id,
          kind: "symbol",
          label: symbol.displayName,
          path: symbol.filePath,
          symbol,
        };
      }
    }

    if (nodeId.startsWith("file:")) {
      return this.toFileGraphItem(nodeId);
    }

    if (nodeId.startsWith("route:") || nodeKindHint === "route") {
      const route = this.routeById(nodeId);
      if (route) {
        return {
          id: route.id,
          kind: "route",
          label: `${route.method} ${route.path}`,
          path: route.filePath,
          confidence: route.confidence,
        };
      }
    }

    return {
      id: nodeId,
      kind: nodeKindHint ?? this.kindFromNodeId(nodeId),
      label: nodeId.includes("#")
        ? nodeId.slice(nodeId.lastIndexOf("#") + 1)
        : nodeId,
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

  fileDependenciesByRepository(
    repositoryId: string,
    targetPath: string,
    direction: DependencyDirection = "both",
    maxDepth = 1,
  ): QueryResult<GraphItem> {
    return this.filterGraphItemsByRepository(
      repositoryId,
      this.fileDependencies(targetPath, direction, maxDepth),
    );
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

  impactFromPathByRepository(
    repositoryId: string,
    targetPath: string,
    maxDepth = 6,
  ): QueryResult<GraphItem> {
    return this.filterGraphItemsByRepository(
      repositoryId,
      this.impactFromPath(targetPath, maxDepth),
    );
  }

  flowFromRoute(routeId: string, maxDepth = 6): QueryResult<GraphItem> {
    const routes = this.routesMatchingId(routeId);
    if (routes.length === 0) {
      return { items: [] };
    }

    if (routes.length === 1) {
      return this.flowFromRouteItem(routes[0], maxDepth);
    }

    return mergeGraphItemResults(
      routes.map((route) => this.flowFromRouteItem(route, maxDepth)),
    );
  }

  private flowFromRouteItem(
    route: RouteItem,
    maxDepth: number,
  ): QueryResult<GraphItem> {
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

  flowFromRouteByRepository(
    repositoryId: string,
    routeId: string,
    maxDepth = 6,
  ): QueryResult<GraphItem> {
    const routes = this.routesByRepository(repositoryId).items.filter(
      (entry) =>
        entry.id === routeId ||
        routeStorageId(entry.id, entry.filePath) === routeId,
    );
    if (routes.length === 0) {
      return { items: [] };
    }

    const result =
      routes.length === 1
        ? this.flowFromRouteItem(routes[0], maxDepth)
        : mergeGraphItemResults(
            routes.map((route) => this.flowFromRouteItem(route, maxDepth)),
          );

    return this.filterGraphItemsByRepository(repositoryId, result);
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

  packageOverviewByRepository(repositoryId: string): QueryResult<GraphItem> {
    const repositories = this.repositories();
    return {
      items: this.packageOverview().items.filter((item) =>
        pathBelongsToRepository(item.path, repositoryId, repositories),
      ),
    };
  }

  repositories(): RepositorySummary[] {
    return deriveRepositories(this.units());
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

  private emptyGraphEnvelope(): GraphEnvelope {
    return createGraphEnvelope();
  }

  private deriveConfidenceLabel(confidence: number): GraphConfidenceLabel {
    if (confidence >= 1) {
      return "proven";
    }
    if (confidence >= 0.75) {
      return "inferred-strong";
    }
    return "inferred-weak";
  }

  private kindFromNodeId(nodeId: string): string {
    if (nodeId.includes(":")) {
      return nodeId.slice(0, nodeId.indexOf(":"));
    }
    return "unknown";
  }

  stats(): IndexSummary {
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

  statsByRepository(repositoryId: string): IndexSummary {
    const repositories = this.repositories();
    const packageCount =
      this.packageOverviewByRepository(repositoryId).items.length;
    const routeCount = this.routesByRepository(repositoryId).items.length;
    const fileRows = this.db
      .prepare("SELECT path FROM files ORDER BY path")
      .all() as Array<{ path: string }>;
    const fileCount = fileRows.filter((row) =>
      pathBelongsToRepository(row.path, repositoryId, repositories),
    ).length;
    const symbolRows = this.db
      .prepare(
        `SELECT files.path AS file_path
         FROM symbols
         INNER JOIN files ON files.id = symbols.file_id`,
      )
      .all() as Array<{ file_path: string }>;
    const symbolCount = symbolRows.filter((row) =>
      pathBelongsToRepository(row.file_path, repositoryId, repositories),
    ).length;
    const queryRows = this.db
      .prepare(
        "SELECT source_id, metadata_json FROM edges WHERE type = 'queries'",
      )
      .all() as Array<{ source_id: string; metadata_json: string | null }>;
    const queryEdgeCount = queryRows.filter((row) => {
      const metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {};
      const path =
        typeof metadata.filePath === "string"
          ? metadata.filePath
          : row.source_id.startsWith("file:")
            ? row.source_id.slice("file:".length)
            : undefined;
      return pathBelongsToRepository(path, repositoryId, repositories);
    }).length;

    return {
      packageCount,
      fileCount,
      symbolCount,
      routeCount,
      queryEdgeCount,
    };
  }

  private filterGraphItemsByRepository(
    repositoryId: string,
    result: QueryResult<GraphItem>,
  ): QueryResult<GraphItem> {
    const repositories = this.repositories();
    return {
      items: result.items.filter((item) =>
        pathBelongsToRepository(item.path, repositoryId, repositories),
      ),
    };
  }

  private ensureSchema(): void {
    const currentVersion = (
      this.db.prepare("PRAGMA user_version").get() as { user_version: number }
    ).user_version;

    if (currentVersion !== SCHEMA_VERSION) {
      this.db.exec(`
        DROP TABLE IF EXISTS packages;
        DROP TABLE IF EXISTS units;
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
        root_path TEXT NOT NULL UNIQUE,
        unit_id TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS units (
        id TEXT PRIMARY KEY,
        root_path TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        kind TEXT NOT NULL,
        language TEXT NOT NULL,
        tooling TEXT NOT NULL,
        indexing_mode TEXT NOT NULL,
        confidence REAL NOT NULL,
        parent_unit_id TEXT,
        signals_json TEXT NOT NULL,
        source_roots_json TEXT NOT NULL,
        plugin_matches_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        package_id TEXT NOT NULL,
        unit_id TEXT NOT NULL,
        hash TEXT NOT NULL,
        tsconfig_context TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS symbols (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        kind TEXT NOT NULL,
        language TEXT NOT NULL,
        file_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        exported INTEGER NOT NULL DEFAULT 0,
        owner_symbol_id TEXT,
        owner_kind TEXT,
        signature_text TEXT,
        framework_role TEXT,
        span_start_line INTEGER,
        span_start_column INTEGER,
        span_end_line INTEGER,
        span_end_column INTEGER
      );

      CREATE TABLE IF NOT EXISTS routes (
        storage_id TEXT PRIMARY KEY,
        id TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        handler_name TEXT NOT NULL,
        handler_symbol_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        framework TEXT NOT NULL,
        unit_id TEXT NOT NULL,
        confidence REAL NOT NULL,
        metadata_json TEXT
      );

      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        target_id TEXT NOT NULL,
        target_kind TEXT NOT NULL,
        confidence REAL NOT NULL,
        confidence_label TEXT NOT NULL,
        provenance_json TEXT,
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

export function openGraphStore(
  dbPath: string,
  options?: GraphStoreOptions,
): GraphStore {
  return new GraphStore(dbPath, options);
}

function symbolSpanSize(symbol: SymbolDescriptor): number {
  if (!symbol.span) {
    return Number.MAX_SAFE_INTEGER;
  }

  return (
    (symbol.span.endLine - symbol.span.startLine) * 10_000 +
    (symbol.span.endColumn - symbol.span.startColumn)
  );
}

function routeStorageId(routeId: string, filePath: string): string {
  return `${routeId}::${filePath}`;
}

function canonicalRouteId(routeLookupId: string): string {
  return routeLookupId.split("::", 1)[0] ?? routeLookupId;
}

function mergeGraphItemResults(
  results: Array<QueryResult<GraphItem>>,
): QueryResult<GraphItem> {
  const items = new Map<string, GraphItem>();

  for (const result of results) {
    for (const item of result.items) {
      const key = `${item.kind}:${item.id}:${item.path ?? ""}`;
      items.set(key, item);
    }
  }

  return {
    items: [...items.values()],
  };
}

export * from "./workspace-paths";
export * from "./workspace-registry";
