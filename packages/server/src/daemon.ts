import { existsSync } from "node:fs";

import {
  type createQueryEngine,
  runWorkspaceIndex,
  withWorkspaceQueryEngineForDbPath,
} from "@graphtrace/query-engine";
import { deriveRepositories } from "@graphtrace/shared";
import {
  type WorkspaceRecord,
  type WorkspaceRegistry,
  createWorkspaceRegistry,
} from "@graphtrace/storage";

export interface CreateGraphTraceDaemonOptions {
  homeDir: string;
}

export interface WorkspaceHomeSummary {
  id: string;
  label: string;
  canonicalRootPath: string;
  status: WorkspaceRecord["status"];
  dbPath: string;
  snapshot: {
    packageCount: number;
    fileCount: number;
    symbolCount: number;
    routeCount: number;
    queryEdgeCount: number;
    lastIndexCompletedAt: string | null;
  } | null;
}

export interface GraphTraceDaemon {
  addWorkspace(
    rootPath: string,
    options?: { label?: string; notes?: string; pinned?: boolean },
  ): Promise<WorkspaceRecord>;
  listWorkspaces(): WorkspaceRecord[];
  listWorkspaceSummaries(): WorkspaceHomeSummary[];
  getWorkspace(workspaceId: string): WorkspaceRecord | null;
  removeWorkspace(workspaceId: string): void;
  reindexWorkspace(workspaceId: string): Promise<WorkspaceRecord>;
  status(
    workspaceId: string,
    repositoryId?: string,
  ): ReturnType<ReturnType<typeof createQueryEngine>["status"]>;
  withWorkspaceQueryEngine<T>(
    workspaceId: string,
    action: (engine: ReturnType<typeof createQueryEngine>) => T,
  ): T;
  close(): void;
}

export function createGraphTraceDaemon(
  options: CreateGraphTraceDaemonOptions,
): GraphTraceDaemon {
  return new DefaultGraphTraceDaemon(createWorkspaceRegistry(options.homeDir));
}

class DefaultGraphTraceDaemon implements GraphTraceDaemon {
  constructor(private readonly registry: WorkspaceRegistry) {}

  async addWorkspace(
    rootPath: string,
    options?: { label?: string; notes?: string; pinned?: boolean },
  ): Promise<WorkspaceRecord> {
    const workspace = this.registry.addWorkspace(rootPath, options);
    const startedAt = new Date().toISOString();

    this.registry.upsertSnapshot(workspace.id, {
      lastIndexMode: "full",
      lastIndexStartedAt: startedAt,
      errorSummary: null,
    });

    try {
      const result = await runWorkspaceIndex({
        workspaceRoot: workspace.canonicalRootPath,
        mode: "full",
        dbPath: workspace.dbPath,
        persistWorkspaceArtifacts: false,
      });

      this.registry.upsertSnapshot(workspace.id, {
        lastIndexMode: "full",
        lastIndexStartedAt: startedAt,
        lastIndexCompletedAt: new Date().toISOString(),
        packageCount: result.summary.packageCount,
        fileCount: result.summary.fileCount,
        symbolCount: result.summary.symbolCount,
        routeCount: result.summary.routeCount,
        queryEdgeCount: result.summary.queryEdgeCount,
        unitCount: result.units.length,
        repositoryCount: deriveRepositories(result.units).length,
        errorSummary: null,
      });
      return this.requireWorkspace(workspace.id);
    } catch (error) {
      this.registry.upsertSnapshot(workspace.id, {
        lastIndexMode: "full",
        lastIndexStartedAt: startedAt,
        lastIndexCompletedAt: new Date().toISOString(),
        errorSummary: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  listWorkspaces(): WorkspaceRecord[] {
    return this.registry
      .listWorkspaces()
      .map((workspace) => this.decorateWorkspace(workspace));
  }

  listWorkspaceSummaries(): WorkspaceHomeSummary[] {
    return this.registry.listWorkspaces().map((workspace) => {
      const decoratedWorkspace = this.decorateWorkspace(workspace);
      const snapshot = this.registry.getSnapshot(workspace.id);

      return {
        id: decoratedWorkspace.id,
        label: decoratedWorkspace.label,
        canonicalRootPath: decoratedWorkspace.canonicalRootPath,
        status: decoratedWorkspace.status,
        dbPath: decoratedWorkspace.dbPath,
        snapshot: snapshot
          ? {
              packageCount: snapshot.packageCount,
              fileCount: snapshot.fileCount,
              symbolCount: snapshot.symbolCount,
              routeCount: snapshot.routeCount,
              queryEdgeCount: snapshot.queryEdgeCount,
              lastIndexCompletedAt: snapshot.lastIndexCompletedAt,
            }
          : null,
      };
    });
  }

  getWorkspace(workspaceId: string): WorkspaceRecord | null {
    const workspace = this.registry.getWorkspace(workspaceId);
    return workspace ? this.decorateWorkspace(workspace) : null;
  }

  removeWorkspace(workspaceId: string): void {
    this.registry.removeWorkspace(workspaceId);
  }

  async reindexWorkspace(workspaceId: string): Promise<WorkspaceRecord> {
    const workspace = this.requireWorkspace(workspaceId);
    await this.addWorkspace(workspace.canonicalRootPath, {
      label: workspace.label,
      notes: workspace.notes ?? undefined,
      pinned: workspace.pinned,
    });
    return this.requireWorkspace(workspaceId);
  }

  status(workspaceId: string, repositoryId?: string) {
    const workspace = this.requireWorkspace(workspaceId);
    return withWorkspaceQueryEngineForDbPath(
      workspace.dbPath,
      (engine, dbPath) =>
        repositoryId
          ? engine.statusByRepository(
              workspace.canonicalRootPath,
              dbPath,
              repositoryId,
            )
          : engine.status(workspace.canonicalRootPath, dbPath),
    );
  }

  withWorkspaceQueryEngine<T>(
    workspaceId: string,
    action: (engine: ReturnType<typeof createQueryEngine>) => T,
  ): T {
    const workspace = this.requireWorkspace(workspaceId);
    return withWorkspaceQueryEngineForDbPath(workspace.dbPath, (engine) =>
      action(engine),
    );
  }

  close(): void {
    this.registry.close();
  }

  private requireWorkspace(workspaceId: string): WorkspaceRecord {
    const workspace = this.registry.getWorkspace(workspaceId);

    if (!workspace) {
      throw new Error(`Unknown workspace: ${workspaceId}`);
    }

    return this.decorateWorkspace(workspace);
  }

  private decorateWorkspace(workspace: WorkspaceRecord): WorkspaceRecord {
    if (
      workspace.status !== "missing" &&
      !existsSync(workspace.canonicalRootPath)
    ) {
      return {
        ...workspace,
        status: "missing",
      };
    }

    return workspace;
  }
}
