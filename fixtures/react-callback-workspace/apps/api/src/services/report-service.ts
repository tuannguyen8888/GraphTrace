const reportsDb = {
  reports: {
    findMany() {
      return ["monthly", "quarterly"];
    },
  },
};

export const reportService = {
  async listReports() {
    return reportsDb.reports.findMany();
  },
};
