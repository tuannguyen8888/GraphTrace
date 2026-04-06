import { prisma } from "../db/client.js";

export async function listUsers(
  _request: unknown,
  reply: { send: (payload: unknown) => void },
) {
  const users = await prisma.user.findMany();
  reply.send(users);
}
