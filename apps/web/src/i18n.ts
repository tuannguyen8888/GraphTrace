export type Locale = "en" | "vi";

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "graphtrace.ui.locale";
export const SUPPORTED_LOCALES: Locale[] = ["en", "vi"];

const LOCALE_TAGS: Record<Locale, string> = {
  en: "en-US",
  vi: "vi-VN",
};

const enMessages = {
  localeLabel: "Language",
  localeNames: {
    en: "English",
    vi: "Tiếng Việt",
  },
  common: {
    loading: "Loading...",
    noneYet: "none yet",
    workspaceRoot: "workspace root",
    repoScopeLabel: "repo",
    testScopeLabel: "test",
    fixtureScopeLabel: "fixture",
    copyPath: "Copy path",
    copyCommand: "Copy command",
    openFile: "Open file",
  },
  status: {
    ready: "Ready",
    indexing: "Indexing",
    failed: "Failed",
    missing: "Missing",
    paused: "Paused",
  },
  home: {
    eyebrow: "MULTI-WORKSPACE GRAPH TRACE",
    intro:
      "Choose an indexed workspace or add a new repo so the daemon can manage everything in one UI.",
    indexedWorkspacesKicker: "Indexed workspaces",
    title: "Workspace home",
    description:
      "The home screen keeps each repo isolated before you drill into repository, package, and graph views.",
    emptyState:
      "No workspaces are registered in this daemon yet. Add the first repo on the right to get started.",
    addRepoKicker: "Add new repo",
    addTitle: "Index a workspace",
    addDescription:
      "Paste a local repo path. GraphTrace will index it into managed storage, so you do not need to run another instance.",
    repoPathLabel: "Repo path",
    repoPathPlaceholder: "/Users/.../my-repo",
    labelOptional: "Label (optional)",
    labelPlaceholder: "my-repo",
    addWorkspace: "Add workspace",
    addingWorkspace: "Indexing workspace...",
  },
  workspaceCard: {
    noSnapshot: "No index snapshot yet.",
    noCompletedIndex: "No completed index run yet.",
    indexingWorkspace: "Indexing workspace...",
    metricSummary: (params: {
      packageCount: number;
      fileCount: number;
      routeCount: number;
    }) =>
      `${params.packageCount} packages · ${params.fileCount} files · ${params.routeCount} routes`,
    indexedAt: (params: { timestamp: string }) => `Indexed ${params.timestamp}`,
  },
  scope: {
    primary: {
      label: "Primary workspace",
      description:
        "Hide fixtures and test-only noise so the main repo stands out.",
    },
    all: {
      label: "Include fixtures",
      description: "Show all packages, routes, and search hits.",
    },
    tests: {
      label: "Tests only",
      description: "Focus on fixtures and test files.",
    },
  },
  app: {
    workspaceListLabel: "Workspaces",
    eyebrow: "LOCAL-FIRST CODE GRAPH",
    intro:
      "Search code, inspect routes, and keep drilling from files, dependencies, impact, and flow without jumping to repo-wide scans too early.",
    backToWorkspaces: "Back to workspaces",
    repositoryScope: "Repository scope",
    refreshGraph: "Refresh graph",
    workspaceLabel: "Workspace",
    lastIndexLabel: "Last index",
    workspaceStatusKicker: "Workspace status",
    graphStateTitle: "Graph state",
    packagesLabel: "Packages",
    filesLabel: "Files",
    symbolsLabel: "Symbols",
    routesLabel: "Routes",
    queryEdgesLabel: "Query edges",
    repositoryLabel: "Repository",
    repositoryRootLabel: "Repository root",
    workspaceRootLabel: "Workspace root",
    dbPathLabel: "DB path",
    modeLabel: "Mode",
    workspaceScopeKicker: "Workspace scope",
    triageLensTitle: "Triage lens",
    packagesKicker: "Packages",
    routeFilterTitle: "Route filter",
    filterByPackageLabel: "Filter by package",
    allVisiblePackages: "All visible packages",
    duplicateLabelHint: "Duplicate label, path used to disambiguate.",
    architectureGraphKicker: "Architecture graph",
    boundedRelationshipTitle: "Bounded relationship view",
    architectureGraphDescription:
      "The graph only shows the neighborhood around the current selection to avoid noise on self-host repositories.",
    graphEdgeFlow: "Flow",
    graphEdgeDepends: "Dependencies",
    graphEdgeImpacts: "Impact",
    graphEdgeContains: "Contains",
    searchResultsKicker: "Search results",
    workbenchTitle: "Symbol and file workbench",
    workbenchDescription:
      "Start with the main repo, then expand into fixtures when you need comparison context.",
    queryLabel: "Query",
    kindLabel: "Kind",
    guidedTriageKicker: "Guided triage",
    noSearchMatches: (params: { searchKind: string; searchText: string }) =>
      `No ${params.searchKind} matched "${params.searchText}" in the current scope. Try a quick pick above or switch the search kind.`,
    idleSearchPrompt:
      "Choose a quick pick above or type a query to inspect matching symbols, routes, files, or packages in the current scope.",
    routeExplorerKicker: "Route explorer",
    httpSurfaceTitle: "HTTP surface",
    routeExplorerDescription:
      "The route list is filtered by the active scope and package instead of ambiguous package labels.",
    noRoutesInScope: "No routes in the current scope or selected package.",
    unmappedPackage: "unmapped package",
    detailPaneKicker: "Detail pane",
    inspectorTitle: "Inspector",
    inspectorDescription:
      "Select a route, file, dependency, impact item, or query hint to keep drilling down.",
    inspectorEmpty:
      "Select a route or search result to inspect flow, dependencies, impact, and quick actions.",
    rerunSearch: "Re-run search",
    inspectorLoading: "Loading inspector data...",
    routeFlowTitle: "Route flow",
    routeFlowSubtitle:
      "Click each file, package, or query hint to continue tracing.",
    relatedPackagesTitle: "Related packages",
    relatedPackagesSubtitle:
      "Packages directly connected to files in the route flow.",
    queryHintsTitle: "Query hints",
    queryHintsSubtitle:
      "Heuristic query clues GraphTrace found along the route flow.",
    dependenciesTitle: "Dependencies",
    dependenciesSubtitle: "Inbound and outbound neighbors within 2 hops.",
    impactTitle: "Impact",
    impactSubtitle:
      "Files and routes that are likely to be affected if this file changes.",
    noItemsInTrace: "No items in this trace region.",
    copiedPath: "Copied file path.",
    copiedCommand: "Copied GraphTrace command.",
    clipboardUnavailable: "Clipboard API is not available in this browser.",
    loadWorkspacesError: "Could not load the workspace list.",
    loadWorkspaceStateError: "Could not load the workspace state.",
    loadInspectorError: "Could not load the inspector.",
    addWorkspaceError: "Could not add the new workspace.",
    noFilePathToTrace: "No file path available for tracing.",
    confidence: (params: { value: number }) => `${params.value}% confidence`,
  },
  graph: {
    emptyState:
      "Select a route, file, or package in the inspector to render the bounded architecture graph around that selection.",
    searchLabel: "Search in graph",
    searchPlaceholder: "route id, package, file path, query hint...",
    resetView: "Reset view",
    fullscreen: "Fullscreen",
    exitFullscreen: "Exit fullscreen",
    noNodeMatch: (params: { searchText: string }) =>
      `No node on the canvas matches "${params.searchText}".`,
    clusterNode: "cluster node",
  },
  searchWorkbench: {
    mainRepoLabel: "main repo",
    startFromContext: (params: { contextLabel: string }) =>
      `Start triage from ${params.contextLabel}`,
    intro:
      "Choose one of the quick picks below to start from a route, package, or file instead of guessing a random symbol.",
    routeQuickPickLabel: (params: { routeId: string }) =>
      `Start from route ${params.routeId}`,
    routeQuickPickReason:
      "Useful when you know the HTTP flow but do not know the symbol name yet.",
    packageQuickPickLabel: (params: { packageLabel: string }) =>
      `Narrow to package ${params.packageLabel}`,
    packageQuickPickReason:
      "Use package search to tighten the triage area before opening a concrete file.",
    fileQuickPickLabel: (params: { filePath: string }) =>
      `Open file ${params.filePath}`,
    fileQuickPickReason:
      "File search works well when you want the exact entrypoint or handler path.",
    step1: (params: { contextLabel: string }) =>
      `1. Start from a route to see flow and query hints in ${params.contextLabel}.`,
    step2: "2. Narrow to the relevant package to cut down noise.",
    step3:
      "3. Open the file or dependency trace once the entrypoint is clear enough.",
    searchKindGuide: {
      route:
        "Route search works best with HTTP ids like GET /api/impact or endpoint path fragments.",
      file:
        "File search works best with path fragments like packages/server/src/index.ts or watch.test.ts.",
      package:
        "Package search works best with package names or root paths when you need to narrow to one code area.",
      symbol:
        "Symbol search works best when you already know a function, class, export, or specific code token.",
    },
  },
};

const viMessages: typeof enMessages = {
  localeLabel: "Ngôn ngữ",
  localeNames: {
    en: "English",
    vi: "Tiếng Việt",
  },
  common: {
    loading: "Đang tải...",
    noneYet: "chưa có",
    workspaceRoot: "gốc workspace",
    repoScopeLabel: "repo",
    testScopeLabel: "test",
    fixtureScopeLabel: "fixture",
    copyPath: "Copy path",
    copyCommand: "Copy command",
    openFile: "Mở file",
  },
  status: {
    ready: "Sẵn sàng",
    indexing: "Đang lập chỉ mục",
    failed: "Lỗi",
    missing: "Thiếu",
    paused: "Tạm dừng",
  },
  home: {
    eyebrow: "GRAPH TRACE NHIỀU WORKSPACE",
    intro:
      "Chọn một workspace đã index hoặc thêm repo mới để daemon quản lý tập trung trong cùng một UI.",
    indexedWorkspacesKicker: "Workspace đã index",
    title: "Trang chủ workspace",
    description:
      "Màn hình home giữ dữ liệu từng repo tách biệt trước khi đi sâu vào repository, package và graph.",
    emptyState:
      "Daemon này chưa có workspace nào. Thêm repo đầu tiên ở cột bên phải để bắt đầu.",
    addRepoKicker: "Thêm repo mới",
    addTitle: "Index một workspace",
    addDescription:
      "Dán đường dẫn repo local. GraphTrace sẽ index vào managed storage nên không cần chạy thêm instance khác.",
    repoPathLabel: "Đường dẫn repo",
    repoPathPlaceholder: "/Users/.../my-repo",
    labelOptional: "Nhãn (không bắt buộc)",
    labelPlaceholder: "my-repo",
    addWorkspace: "Thêm workspace",
    addingWorkspace: "Đang index workspace...",
  },
  workspaceCard: {
    noSnapshot: "Chưa có snapshot index.",
    noCompletedIndex: "Chưa có lần index hoàn tất.",
    indexingWorkspace: "Đang lập chỉ mục workspace...",
    metricSummary: (params: {
      packageCount: number;
      fileCount: number;
      routeCount: number;
    }) =>
      `${params.packageCount} packages · ${params.fileCount} files · ${params.routeCount} routes`,
    indexedAt: (params: { timestamp: string }) =>
      `Đã index ${params.timestamp}`,
  },
  scope: {
    primary: {
      label: "Workspace chính",
      description: "Ẩn fixtures và test-only noise để repo chính nổi bật hơn.",
    },
    all: {
      label: "Kèm fixtures",
      description: "Hiện toàn bộ packages, routes và search hits.",
    },
    tests: {
      label: "Chỉ test",
      description: "Tập trung vào fixtures và các file test.",
    },
  },
  app: {
    workspaceListLabel: "Workspaces",
    eyebrow: "ĐỒ THỊ CODE LOCAL-FIRST",
    intro:
      "Search code, inspect routes và tiếp tục đào sâu từ file, dependency, impact và flow mà chưa phải nhảy sang repo-wide scan quá sớm.",
    backToWorkspaces: "Quay lại danh sách workspace",
    repositoryScope: "Phạm vi repository",
    refreshGraph: "Làm mới graph",
    workspaceLabel: "Workspace",
    lastIndexLabel: "Lần index gần nhất",
    workspaceStatusKicker: "Trạng thái workspace",
    graphStateTitle: "Trạng thái graph",
    packagesLabel: "Packages",
    filesLabel: "Files",
    symbolsLabel: "Symbols",
    routesLabel: "Routes",
    queryEdgesLabel: "Query edges",
    repositoryLabel: "Repository",
    repositoryRootLabel: "Gốc repository",
    workspaceRootLabel: "Gốc workspace",
    dbPathLabel: "Đường dẫn DB",
    modeLabel: "Mode",
    workspaceScopeKicker: "Phạm vi workspace",
    triageLensTitle: "Lăng kính triage",
    packagesKicker: "Packages",
    routeFilterTitle: "Bộ lọc route",
    filterByPackageLabel: "Lọc theo package",
    allVisiblePackages: "Tất cả package đang thấy",
    duplicateLabelHint: "Trùng label nên dùng path để phân biệt.",
    architectureGraphKicker: "Đồ thị kiến trúc",
    boundedRelationshipTitle: "Quan hệ lân cận có giới hạn",
    architectureGraphDescription:
      "Graph chỉ hiển thị neighborhood quanh selection hiện tại để giảm noise trên self-host repository.",
    graphEdgeFlow: "Flow",
    graphEdgeDepends: "Dependencies",
    graphEdgeImpacts: "Impact",
    graphEdgeContains: "Contains",
    searchResultsKicker: "Kết quả search",
    workbenchTitle: "Workbench symbol và file",
    workbenchDescription:
      "Tập trung vào repo chính trước, rồi mới mở rộng sang fixtures khi cần đối chiếu.",
    queryLabel: "Truy vấn",
    kindLabel: "Loại",
    guidedTriageKicker: "Triage có hướng dẫn",
    noSearchMatches: (params: { searchKind: string; searchText: string }) =>
      `Chưa thấy ${params.searchKind} nào khớp với "${params.searchText}" trong scope hiện tại. Thử quick pick phía trên hoặc đổi kind search.`,
    idleSearchPrompt:
      "Chọn quick pick phía trên hoặc gõ query để xem symbol, route, file hoặc package khớp với scope hiện tại.",
    routeExplorerKicker: "Khám phá route",
    httpSurfaceTitle: "Bề mặt HTTP",
    routeExplorerDescription:
      "Danh sách route được lọc theo scope và package đang chọn, không còn phụ thuộc vào package label mơ hồ.",
    noRoutesInScope: "Không có route nào trong scope hoặc package hiện tại.",
    unmappedPackage: "chưa map package",
    detailPaneKicker: "Khung chi tiết",
    inspectorTitle: "Inspector",
    inspectorDescription:
      "Chọn route, file, dependency, impact item hoặc query hint để tiếp tục drill-down.",
    inspectorEmpty:
      "Chọn một route hoặc search result để xem flow, dependencies, impact và quick actions.",
    rerunSearch: "Chạy lại search",
    inspectorLoading: "Đang tải dữ liệu inspector...",
    routeFlowTitle: "Luồng route",
    routeFlowSubtitle:
      "Click vào từng file, package hoặc query hint để tiếp tục trace.",
    relatedPackagesTitle: "Packages liên quan",
    relatedPackagesSubtitle:
      "Packages liên quan trực tiếp tới các file trong route flow.",
    queryHintsTitle: "Gợi ý query",
    queryHintsSubtitle:
      "Các query heuristics GraphTrace tìm thấy dọc route flow.",
    dependenciesTitle: "Dependencies",
    dependenciesSubtitle: "Các điểm vào và ra trong bán kính 2 bước.",
    impactTitle: "Impact",
    impactSubtitle:
      "Những file và route dễ bị ảnh hưởng nếu chỉnh file này.",
    noItemsInTrace: "Không có item nào trong vùng trace này.",
    copiedPath: "Đã copy file path.",
    copiedCommand: "Đã copy GraphTrace command.",
    clipboardUnavailable: "Clipboard API không khả dụng trong browser này.",
    loadWorkspacesError: "Không tải được danh sách workspace.",
    loadWorkspaceStateError: "Không tải được trạng thái workspace.",
    loadInspectorError: "Không tải được inspector.",
    addWorkspaceError: "Không thêm được workspace mới.",
    noFilePathToTrace: "Không có file path để trace.",
    confidence: (params: { value: number }) => `${params.value}% confidence`,
  },
  graph: {
    emptyState:
      "Chọn route, file hoặc package trong inspector để xem bounded architecture graph quanh selection đó.",
    searchLabel: "Tìm trong graph",
    searchPlaceholder: "route id, package, file path, query hint...",
    resetView: "Đặt lại góc nhìn",
    fullscreen: "Toàn màn hình",
    exitFullscreen: "Thoát toàn màn hình",
    noNodeMatch: (params: { searchText: string }) =>
      `Không có node nào trên canvas khớp với "${params.searchText}".`,
    clusterNode: "node cụm",
  },
  searchWorkbench: {
    mainRepoLabel: "repo chính",
    startFromContext: (params: { contextLabel: string }) =>
      `Bắt đầu triage từ ${params.contextLabel}`,
    intro:
      "Chọn một quick pick bên dưới để bắt đầu từ route, package hoặc file thay vì đoán symbol ngẫu nhiên.",
    routeQuickPickLabel: (params: { routeId: string }) =>
      `Bắt đầu từ route ${params.routeId}`,
    routeQuickPickReason:
      "Hợp khi đã biết luồng HTTP nhưng chưa biết chính xác tên symbol.",
    packageQuickPickLabel: (params: { packageLabel: string }) =>
      `Khoanh vùng package ${params.packageLabel}`,
    packageQuickPickReason:
      "Dùng package search để bó hẹp vùng triage trước khi mở file cụ thể.",
    fileQuickPickLabel: (params: { filePath: string }) =>
      `Mở file ${params.filePath}`,
    fileQuickPickReason:
      "File search hợp khi cần mở đúng entrypoint hoặc handler path.",
    step1: (params: { contextLabel: string }) =>
      `1. Đi từ route để thấy flow và query hints trong ${params.contextLabel}.`,
    step2: "2. Khoanh vùng package liên quan để cắt bớt noise.",
    step3:
      "3. Mở file hoặc dependency trace khi đã có entrypoint đủ rõ.",
    searchKindGuide: {
      route:
        "Route search hợp với HTTP ids như GET /api/impact hoặc path fragments của endpoint.",
      file:
        "File search hợp với path fragments như packages/server/src/index.ts hoặc watch.test.ts.",
      package:
        "Package search hợp với package name hoặc root path khi cần khoanh vùng một khu vực code.",
      symbol:
        "Symbol search hợp khi đã biết function, class, export hoặc token code cụ thể.",
    },
  },
};

export type UiMessages = typeof enMessages;

export function resolveLocale(
  value?: string | null,
  fallback: Locale = DEFAULT_LOCALE,
): Locale {
  return value === "vi" || value === "en" ? value : fallback;
}

export function getMessages(locale: Locale): UiMessages {
  return locale === "vi" ? viMessages : enMessages;
}

export function formatLocaleDateTime(locale: Locale, value: string): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
