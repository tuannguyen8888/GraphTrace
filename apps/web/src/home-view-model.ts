import { type Locale, formatLocaleDateTime, getMessages } from "./i18n";

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
  locale: Locale,
): WorkspaceCard[] {
  const messages = getMessages(locale);

  return workspaces.map((workspace) => ({
    id: workspace.id,
    label: workspace.label,
    subline: workspace.canonicalRootPath,
    statusLabel: formatWorkspaceStatus(workspace.status, locale),
    statusTone: workspace.status,
    metricSummary: workspace.snapshot
      ? messages.workspaceCard.metricSummary({
          packageCount: workspace.snapshot.packageCount,
          fileCount: workspace.snapshot.fileCount,
          routeCount: workspace.snapshot.routeCount,
        })
      : messages.workspaceCard.noSnapshot,
    timestampLabel: workspace.snapshot?.lastIndexCompletedAt
      ? messages.workspaceCard.indexedAt({
          timestamp: formatLocaleDateTime(
            locale,
            workspace.snapshot.lastIndexCompletedAt,
          ),
        })
      : workspace.status === "indexing"
        ? messages.workspaceCard.indexingWorkspace
        : messages.workspaceCard.noCompletedIndex,
    dbPath: workspace.dbPath,
  }));
}

export function formatWorkspaceStatus(
  status: WorkspaceHomeSummary["status"],
  locale: Locale,
) {
  const messages = getMessages(locale);

  switch (status) {
    case "ready":
      return messages.status.ready;
    case "indexing":
      return messages.status.indexing;
    case "failed":
      return messages.status.failed;
    case "missing":
      return messages.status.missing;
    case "paused":
      return messages.status.paused;
  }
}
