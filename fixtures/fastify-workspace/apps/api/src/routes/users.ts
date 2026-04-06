import { listUsers } from "../services/user-service.js";

export async function registerUserRoutes(fastify: {
  get: (path: string, handler: typeof listUsers) => void;
}) {
  fastify.get("/users", listUsers);
}
