export interface WorkspaceHomeSummary {
  id: string;
  label: string;
  canonicalRootPath: string;
  status: "ready" | "indexing" | "failed" | "missing" | "paused";
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

export interface WorkspaceCard {
  id: string;
  label: string;
  subline: string;
  statusLabel: string;
  statusTone: WorkspaceHomeSummary["status"];
  metricSummary: string;
  timestampLabel: string;
  dbPath: string;
}

export function buildWorkspaceCards(
  workspaces: WorkspaceHomeSummary[],
): WorkspaceCard[] {
  return workspaces.map((workspace) => ({
    id: workspace.id,
    label: workspace.label,
    subline: workspace.canonicalRootPath,
    statusLabel: formatWorkspaceStatus(workspace.status),
    statusTone: workspace.status,
    metricSummary: workspace.snapshot
      ? `${workspace.snapshot.packageCount} packages · ${workspace.snapshot.fileCount} files · ${workspace.snapshot.routeCount} routes`
      : "Chưa có snapshot index.",
    timestampLabel: workspace.snapshot?.lastIndexCompletedAt
      ? `Indexed ${new Date(workspace.snapshot.lastIndexCompletedAt).toLocaleString()}`
      : workspace.status === "indexing"
        ? "Đang index workspace..."
        : "Chưa có lần index hoàn tất.",
    dbPath: workspace.dbPath,
  }));
}

export function formatWorkspaceStatus(status: WorkspaceHomeSummary["status"]) {
  switch (status) {
    case "ready":
      return "Ready";
    case "indexing":
      return "Indexing";
    case "failed":
      return "Failed";
    case "missing":
      return "Missing";
    case "paused":
      return "Paused";
  }
}
