export interface SearchReplayCase {
  id: string;
  query: string;
  expected: Array<{
    idIncludes?: string;
    pathIncludes?: string;
    labelIncludes?: string;
    kind?: string;
  }>;
}

export const historicalSearchReplayCases = [
  {
    id: "express-user-route-intent",
    query: "users route listUsers user service prisma",
    expected: [
      {
        pathIncludes: "apps/api/src/routes/users.ts",
      },
      {
        idIncludes: "listUsers",
      },
    ],
  },
  {
    id: "next-session-data-route-intent",
    query: "session-data route GET POST",
    expected: [
      {
        pathIncludes: "app/api/session-data/route.ts",
      },
    ],
  },
  {
    id: "laravel-admin-users-controller-intent",
    query: "admin users controller permissions roles",
    expected: [
      {
        idIncludes: "AdminUsersController",
      },
    ],
  },
  {
    id: "express-symbol-exact-control",
    query: "listUsers",
    expected: [
      {
        idIncludes: "listUsers",
      },
    ],
  },
] satisfies SearchReplayCase[];
