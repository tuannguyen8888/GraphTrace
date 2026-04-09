export function listUsers() {
  return ["alice", "bob"];
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
