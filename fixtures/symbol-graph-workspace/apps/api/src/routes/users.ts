import { Router } from "express";
import { listUsers } from "../services/user-service.js";

export const router = Router();

export function registerRoutes() {
  router.get("/users", listUsers);
  router.post("/reports", async (request, response) => {
    response.send({ body: request.body, ok: true });
  });
  return router;
}
