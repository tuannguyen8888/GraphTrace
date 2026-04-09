import { Router } from "express";
import {
  createReporter,
  listUsers,
  metrics,
  withAudit,
} from "../services/user-service.js";

export const router = Router();
const auditedListUsers = withAudit(listUsers);

export function registerRoutes() {
  router.get("/users", auditedListUsers);
  router.post("/reports", async (request, response) => {
    const runReport = createReporter();
    const trackRoute = metrics.trackRoute;
    trackRoute;
    response.send(runReport(request.body));
  });
  return router;
}
