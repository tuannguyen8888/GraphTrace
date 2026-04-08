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

export interface GraphTraceDaemon {
  addWorkspace(
    rootPath: string,
    options?: { label?: string; notes?: string; pinned?: boolean },
  ): Promise<WorkspaceRecord>;
  listWorkspaces(): WorkspaceRecord[];
  getWorkspace(workspaceId: string): WorkspaceRecord | null;
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
    return this.registry.listWorkspaces();
  }

  getWorkspace(workspaceId: string): WorkspaceRecord | null {
    return this.registry.getWorkspace(workspaceId);
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

    return workspace;
  }
}
