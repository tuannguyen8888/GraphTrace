import { Router } from "express";
import { listUsers } from "../services/user-service.js";

export function createRouter() {
  const router = Router();
  router.get("/users", listUsers);
  return router;
}
