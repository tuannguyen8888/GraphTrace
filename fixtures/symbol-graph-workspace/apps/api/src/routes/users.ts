import { Router } from "express";
import {
  createReporter,
  listUsers,
  metrics,
} from "../services/user-service.js";

export const router = Router();

export function registerRoutes() {
  router.get("/users", listUsers);
  router.post("/reports", async (request, response) => {
    const runReport = createReporter();
    const trackRoute = metrics.trackRoute;
    trackRoute;
    response.send(runReport(request.body));
  });
  return router;
}
