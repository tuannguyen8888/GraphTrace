export async function listUsers() {
  return db.select().from(usersTable);
}
