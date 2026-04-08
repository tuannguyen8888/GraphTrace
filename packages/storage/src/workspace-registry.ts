import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  buildRegistryDbPath,
  deriveWorkspaceIdentity,
} from "./workspace-paths";

export type WorkspaceStatus =
  | "ready"
  | "indexing"
  | "failed"
  | "missing"
  | "paused";

export type WorkspaceStorageMode = "managed" | "imported_local";

export interface WorkspaceRecord {
  id: string;
  label: string;
  rootPath: string;
  canonicalRootPath: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  status: WorkspaceStatus;
  dbPath: string;
  storageMode: WorkspaceStorageMode;
  notes: string | null;
  pinned: boolean;
}

export interface WorkspaceSnapshot {
  workspaceId: string;
  lastIndexMode: "full" | "incremental" | null;
  lastIndexStartedAt: string | null;
  lastIndexCompletedAt: string | null;
  packageCount: number;
  fileCount: number;
  symbolCount: number;
  routeCount: number;
  queryEdgeCount: number;
  unitCount: number;
  repositoryCount: number;
  errorSummary: string | null;
}

export type WorkspaceJobType =
  | "full_index"
  | "incremental_index"
  | "rebuild"
  | "delete";

export type WorkspaceJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export interface WorkspaceJob {
  id: number;
  workspaceId: string;
  type: WorkspaceJobType;
  status: WorkspaceJobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface AddWorkspaceOptions {
  label?: string;
  notes?: string;
  pinned?: boolean;
}

export interface WorkspaceRegistry {
  readonly dbPath: string;
  addWorkspace(rootPath: string, options?: AddWorkspaceOptions): WorkspaceRecord;
  listWorkspaces(): WorkspaceRecord[];
  getWorkspace(workspaceId: string): WorkspaceRecord | null;
  removeWorkspace(workspaceId: string): void;
  upsertSnapshot(
    workspaceId: string,
    snapshot: Partial<Omit<WorkspaceSnapshot, "workspaceId">>,
  ): WorkspaceSnapshot;
  getSnapshot(workspaceId: string): WorkspaceSnapshot | null;
  createJob(workspaceId: string, type: WorkspaceJobType): WorkspaceJob;
  updateJobStatus(
    jobId: number,
    status: WorkspaceJobStatus,
    options?: { errorMessage?: string | null },
  ): WorkspaceJob | null;
  listJobs(workspaceId: string): WorkspaceJob[];
  close(): void;
}

export function createWorkspaceRegistry(homeDir: string): WorkspaceRegistry {
  return new SqliteWorkspaceRegistry(homeDir);
}

class SqliteWorkspaceRegistry implements WorkspaceRegistry {
  readonly dbPath: string;
  readonly db: DatabaseSync;
  readonly homeDir: string;

  constructor(homeDir: string) {
    this.homeDir = homeDir;
    this.dbPath = buildRegistryDbPath(homeDir);
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath, {
      timeout: 10_000,
    });
    this.ensureSchema();
  }

  addWorkspace(
    rootPath: string,
    options: AddWorkspaceOptions = {},
  ): WorkspaceRecord {
    const identity = deriveWorkspaceIdentity(rootPath, this.homeDir);
    const now = new Date().toISOString();
    const label = options.label?.trim() || identity.slug;

    this.db
      .prepare(`
        INSERT INTO workspaces (
          id,
          label,
          root_path,
          canonical_root_path,
          slug,
          created_at,
          updated_at,
          last_opened_at,
          status,
          db_path,
          storage_mode,
          notes,
          pinned
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'ready', ?, 'managed', ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          root_path = excluded.root_path,
          canonical_root_path = excluded.canonical_root_path,
          slug = excluded.slug,
          updated_at = excluded.updated_at,
          db_path = excluded.db_path,
          notes = excluded.notes,
          pinned = excluded.pinned
      `)
      .run(
        identity.id,
        label,
        identity.rootPath,
        identity.canonicalRootPath,
        identity.slug,
        now,
        now,
        identity.dbPath,
        options.notes ?? null,
        options.pinned ? 1 : 0,
      );

    return this.getWorkspace(identity.id)!;
  }

  listWorkspaces(): WorkspaceRecord[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM workspaces ORDER BY pinned DESC, updated_at DESC, label ASC",
        )
        .all() as unknown as WorkspaceRow[]
    ).map(mapWorkspaceRow);
  }

  getWorkspace(workspaceId: string): WorkspaceRecord | null {
    const row = this.db
      .prepare("SELECT * FROM workspaces WHERE id = ?")
      .get(workspaceId) as WorkspaceRow | undefined;
    return row ? mapWorkspaceRow(row) : null;
  }

  removeWorkspace(workspaceId: string): void {
    const workspace = this.getWorkspace(workspaceId);
    this.db
      .prepare("DELETE FROM workspace_jobs WHERE workspace_id = ?")
      .run(workspaceId);
    this.db
      .prepare("DELETE FROM workspace_snapshots WHERE workspace_id = ?")
      .run(workspaceId);
    this.db.prepare("DELETE FROM workspaces WHERE id = ?").run(workspaceId);

    if (workspace) {
      rmSync(dirname(workspace.dbPath), { recursive: true, force: true });
    }
  }

  upsertSnapshot(
    workspaceId: string,
    snapshot: Partial<Omit<WorkspaceSnapshot, "workspaceId">>,
  ): WorkspaceSnapshot {
    const current = this.getSnapshot(workspaceId);
    const merged: WorkspaceSnapshot = {
      workspaceId,
      lastIndexMode: snapshot.lastIndexMode ?? current?.lastIndexMode ?? null,
      lastIndexStartedAt:
        snapshot.lastIndexStartedAt ?? current?.lastIndexStartedAt ?? null,
      lastIndexCompletedAt:
        snapshot.lastIndexCompletedAt ?? current?.lastIndexCompletedAt ?? null,
      packageCount: snapshot.packageCount ?? current?.packageCount ?? 0,
      fileCount: snapshot.fileCount ?? current?.fileCount ?? 0,
      symbolCount: snapshot.symbolCount ?? current?.symbolCount ?? 0,
      routeCount: snapshot.routeCount ?? current?.routeCount ?? 0,
      queryEdgeCount: snapshot.queryEdgeCount ?? current?.queryEdgeCount ?? 0,
      unitCount: snapshot.unitCount ?? current?.unitCount ?? 0,
      repositoryCount:
        snapshot.repositoryCount ?? current?.repositoryCount ?? 0,
      errorSummary: snapshot.errorSummary ?? current?.errorSummary ?? null,
    };

    this.db
      .prepare(`
        INSERT INTO workspace_snapshots (
          workspace_id,
          last_index_mode,
          last_index_started_at,
          last_index_completed_at,
          package_count,
          file_count,
          symbol_count,
          route_count,
          query_edge_count,
          unit_count,
          repository_count,
          error_summary
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET
          last_index_mode = excluded.last_index_mode,
          last_index_started_at = excluded.last_index_started_at,
          last_index_completed_at = excluded.last_index_completed_at,
          package_count = excluded.package_count,
          file_count = excluded.file_count,
          symbol_count = excluded.symbol_count,
          route_count = excluded.route_count,
          query_edge_count = excluded.query_edge_count,
          unit_count = excluded.unit_count,
          repository_count = excluded.repository_count,
          error_summary = excluded.error_summary
      `)
      .run(
        merged.workspaceId,
        merged.lastIndexMode,
        merged.lastIndexStartedAt,
        merged.lastIndexCompletedAt,
        merged.packageCount,
        merged.fileCount,
        merged.symbolCount,
        merged.routeCount,
        merged.queryEdgeCount,
        merged.unitCount,
        merged.repositoryCount,
        merged.errorSummary,
      );

    return this.getSnapshot(workspaceId)!;
  }

  getSnapshot(workspaceId: string): WorkspaceSnapshot | null {
    const row = this.db
      .prepare("SELECT * FROM workspace_snapshots WHERE workspace_id = ?")
      .get(workspaceId) as WorkspaceSnapshotRow | undefined;
    return row ? mapSnapshotRow(row) : null;
  }

  createJob(workspaceId: string, type: WorkspaceJobType): WorkspaceJob {
    const createdAt = new Date().toISOString();
    const result = this.db
      .prepare(`
        INSERT INTO workspace_jobs (
          workspace_id,
          type,
          status,
          created_at,
          started_at,
          completed_at,
          error_message
        )
        VALUES (?, ?, 'queued', ?, NULL, NULL, NULL)
      `)
      .run(workspaceId, type, createdAt);

    return this.db
      .prepare("SELECT * FROM workspace_jobs WHERE id = ?")
      .get(Number(result.lastInsertRowid)) as unknown as WorkspaceJob;
  }

  updateJobStatus(
    jobId: number,
    status: WorkspaceJobStatus,
    options: { errorMessage?: string | null } = {},
  ): WorkspaceJob | null {
    const now = new Date().toISOString();
    const startedAt = status === "running" ? now : null;
    const completedAt =
      status === "completed" || status === "failed" ? now : null;

    this.db
      .prepare(`
        UPDATE workspace_jobs
        SET
          status = ?,
          started_at = COALESCE(?, started_at),
          completed_at = ?,
          error_message = ?
        WHERE id = ?
      `)
      .run(
        status,
        startedAt,
        completedAt,
        options.errorMessage ?? null,
        jobId,
      );

    const row = this.db
      .prepare("SELECT * FROM workspace_jobs WHERE id = ?")
      .get(jobId) as WorkspaceJobRow | undefined;
    return row ? mapJobRow(row) : null;
  }

  listJobs(workspaceId: string): WorkspaceJob[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM workspace_jobs WHERE workspace_id = ? ORDER BY id DESC",
        )
        .all(workspaceId) as unknown as WorkspaceJobRow[]
    ).map(mapJobRow);
  }

  close(): void {
    this.db.close();
  }

  private ensureSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        root_path TEXT NOT NULL,
        canonical_root_path TEXT NOT NULL UNIQUE,
        slug TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_opened_at TEXT,
        status TEXT NOT NULL,
        db_path TEXT NOT NULL,
        storage_mode TEXT NOT NULL,
        notes TEXT,
        pinned INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS workspace_snapshots (
        workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
        last_index_mode TEXT,
        last_index_started_at TEXT,
        last_index_completed_at TEXT,
        package_count INTEGER NOT NULL DEFAULT 0,
        file_count INTEGER NOT NULL DEFAULT 0,
        symbol_count INTEGER NOT NULL DEFAULT 0,
        route_count INTEGER NOT NULL DEFAULT 0,
        query_edge_count INTEGER NOT NULL DEFAULT 0,
        unit_count INTEGER NOT NULL DEFAULT 0,
        repository_count INTEGER NOT NULL DEFAULT 0,
        error_summary TEXT
      );

      CREATE TABLE IF NOT EXISTS workspace_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        error_message TEXT
      );
    `);
  }
}

interface WorkspaceRow {
  id: string;
  label: string;
  root_path: string;
  canonical_root_path: string;
  slug: string;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
  status: WorkspaceStatus;
  db_path: string;
  storage_mode: WorkspaceStorageMode;
  notes: string | null;
  pinned: number;
}

interface WorkspaceSnapshotRow {
  workspace_id: string;
  last_index_mode: "full" | "incremental" | null;
  last_index_started_at: string | null;
  last_index_completed_at: string | null;
  package_count: number;
  file_count: number;
  symbol_count: number;
  route_count: number;
  query_edge_count: number;
  unit_count: number;
  repository_count: number;
  error_summary: string | null;
}

interface WorkspaceJobRow {
  id: number;
  workspace_id: string;
  type: WorkspaceJobType;
  status: WorkspaceJobStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

function mapWorkspaceRow(row: WorkspaceRow): WorkspaceRecord {
  return {
    id: row.id,
    label: row.label,
    rootPath: row.root_path,
    canonicalRootPath: row.canonical_root_path,
    slug: row.slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
    status: row.status,
    dbPath: row.db_path,
    storageMode: row.storage_mode,
    notes: row.notes,
    pinned: Boolean(row.pinned),
  };
}

function mapSnapshotRow(row: WorkspaceSnapshotRow): WorkspaceSnapshot {
  return {
    workspaceId: row.workspace_id,
    lastIndexMode: row.last_index_mode,
    lastIndexStartedAt: row.last_index_started_at,
    lastIndexCompletedAt: row.last_index_completed_at,
    packageCount: row.package_count,
    fileCount: row.file_count,
    symbolCount: row.symbol_count,
    routeCount: row.route_count,
    queryEdgeCount: row.query_edge_count,
    unitCount: row.unit_count,
    repositoryCount: row.repository_count,
    errorSummary: row.error_summary,
  };
}

function mapJobRow(row: WorkspaceJobRow): WorkspaceJob {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.type,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
  };
}
