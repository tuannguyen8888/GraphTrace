import type { ScopeMode } from "./view-model";

export interface RouteState {
  workspaceId: string;
  repositoryId: string;
  scopeMode: ScopeMode;
  selectedPackageId: string;
  searchText: string;
  searchKind: string;
}

export function parseRouteState(href: string): RouteState {
  const url = new URL(href);
  const workspaceId = parseWorkspaceId(url.pathname);
  const scope = url.searchParams.get("scope");
  const kind = url.searchParams.get("kind");

  return {
    workspaceId,
    repositoryId: url.searchParams.get("repository") ?? ".",
    scopeMode: scope === "all" || scope === "tests" ? scope : "primary",
    selectedPackageId: url.searchParams.get("package") ?? "",
    searchText: url.searchParams.get("q") ?? "",
    searchKind:
      kind === "route" || kind === "file" || kind === "package"
        ? kind
        : "symbol",
  };
}

export function buildRouteHref(state: RouteState): string {
  if (!state.workspaceId) {
    return "/";
  }

  const url = new URL(
    `/workspaces/${encodeURIComponent(state.workspaceId)}`,
    "http://localhost",
  );
  url.searchParams.set("repository", state.repositoryId);
  url.searchParams.set("scope", state.scopeMode);

  if (state.selectedPackageId) {
    url.searchParams.set("package", state.selectedPackageId);
  }

  if (state.searchText.trim()) {
    url.searchParams.set("q", state.searchText);
    url.searchParams.set("kind", state.searchKind);
  }

  return `${url.pathname}${url.search}`;
}

function parseWorkspaceId(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] !== "workspaces") {
    return "";
  }

  return decodeURIComponent(segments[1] ?? "");
}
