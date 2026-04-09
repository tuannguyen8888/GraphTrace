import { Router } from "express";
import { requireSession } from "../security/require-session.js";
import { reportService } from "../services/report-service.js";

export const router = Router();

export function registerRoutes() {
  router.get(
    "/reports",
    requireSession(async function reportsRoute(_request, response) {
      return response.json(await reportService.listReports());
    }),
  );

  return router;
}
