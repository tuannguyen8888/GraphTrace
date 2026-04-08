import type { RepositorySummary } from "@graphtrace/shared";

import type { WorkspaceHomeSummary } from "./home-view-model";
import type {
  GraphItem,
  PackageSummary,
  QueryResult,
  RouteSummary,
  SearchResult,
  WorkspaceStatus,
} from "./view-model";

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as T;
}

export function getWorkspaces(refreshNonce = 0) {
  return fetchJson<QueryResult<WorkspaceHomeSummary>>(
    `/api/workspaces?refresh=${refreshNonce}`,
  );
}

export function addWorkspace(input: { rootPath: string; label?: string }) {
  return fetchJson<WorkspaceHomeSummary | { id: string; label: string }>(
    "/api/workspaces",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
}

export function getWorkspaceRepositories(
  workspaceId: string,
  refreshNonce = 0,
) {
  return fetchJson<QueryResult<RepositorySummary>>(
    buildWorkspaceApiPath(workspaceId, "repositories", refreshNonce),
  );
}

export function getWorkspaceStatus(
  workspaceId: string,
  refreshNonce = 0,
  repositoryId?: string,
) {
  return fetchJson<WorkspaceStatus>(
    buildWorkspaceApiPath(workspaceId, "status", refreshNonce, repositoryId),
  );
}

export function getWorkspacePackages(
  workspaceId: string,
  refreshNonce = 0,
  repositoryId?: string,
) {
  return fetchJson<QueryResult<PackageSummary>>(
    buildWorkspaceApiPath(workspaceId, "packages", refreshNonce, repositoryId),
  );
}

export function getWorkspaceRoutes(
  workspaceId: string,
  refreshNonce = 0,
  repositoryId?: string,
) {
  return fetchJson<QueryResult<RouteSummary>>(
    buildWorkspaceApiPath(workspaceId, "routes", refreshNonce, repositoryId),
  );
}

export function searchWorkspace(
  workspaceId: string,
  searchText: string,
  kind: string,
  repositoryId?: string,
) {
  const query = new URLSearchParams({
    q: searchText,
    kind,
  });

  if (repositoryId) {
    query.set("repository", repositoryId);
  }

  return fetchJson<QueryResult<SearchResult>>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/search?${query.toString()}`,
  );
}

export function getRouteFlow(
  workspaceId: string,
  routeId: string,
  refreshNonce = 0,
  repositoryId?: string,
) {
  return fetchJson<QueryResult<GraphItem>>(
    buildWorkspaceTargetApiPath(
      workspaceId,
      "flow",
      routeId,
      refreshNonce,
      repositoryId,
    ),
  );
}

export function getFileDependencies(
  workspaceId: string,
  targetPath: string,
  refreshNonce = 0,
  repositoryId?: string,
) {
  return fetchJson<QueryResult<GraphItem>>(
    buildWorkspaceTargetApiPath(
      workspaceId,
      "deps",
      targetPath,
      refreshNonce,
      repositoryId,
      {
        direction: "both",
        depth: "2",
      },
    ),
  );
}

export function getFileImpact(
  workspaceId: string,
  targetPath: string,
  refreshNonce = 0,
  repositoryId?: string,
) {
  return fetchJson<QueryResult<GraphItem>>(
    buildWorkspaceTargetApiPath(
      workspaceId,
      "impact",
      targetPath,
      refreshNonce,
      repositoryId,
      {
        depth: "4",
      },
    ),
  );
}

function buildWorkspaceApiPath(
  workspaceId: string,
  endpoint: string,
  refreshNonce = 0,
  repositoryId?: string,
) {
  const query = new URLSearchParams();

  if (repositoryId) {
    query.set("repository", repositoryId);
  }
  query.set("refresh", String(refreshNonce));

  return `/api/workspaces/${encodeURIComponent(workspaceId)}/${endpoint}?${query.toString()}`;
}

function buildWorkspaceTargetApiPath(
  workspaceId: string,
  endpoint: string,
  target: string,
  refreshNonce = 0,
  repositoryId?: string,
  extras: Record<string, string> = {},
) {
  const query = new URLSearchParams({
    target,
    refresh: String(refreshNonce),
    ...extras,
  });

  if (repositoryId) {
    query.set("repository", repositoryId);
  }

  return `/api/workspaces/${encodeURIComponent(workspaceId)}/${endpoint}?${query.toString()}`;
}
