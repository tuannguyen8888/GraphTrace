export default async function UsersPage() {
  const response = await fetch("/api/users");
  const users = await response.json();
  return users.length;
}
