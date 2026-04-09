const prisma = {
  user: {
    findMany() {
      return ["alice", "bob"];
    },
  },
};

export async function listUsers() {
  return prisma.user.findMany();
}

export function withAudit(handler: typeof listUsers) {
  return async function auditedHandler() {
    return handler();
  };
}

export const createReporter = () => {
  return (payload: unknown) => normalizeReport(payload);
};

const normalizeReport = (payload: unknown) => ({ payload });

export const metrics = {
  trackRoute(payload: unknown) {
    return normalizeReport(payload);
  },
};

export class UsersController {
  async archiveUser(id: string) {
    return metrics.trackRoute(id);
  }
}
