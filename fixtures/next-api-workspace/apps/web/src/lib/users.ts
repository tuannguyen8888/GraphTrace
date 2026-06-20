export async function loadUsers() {
  const response = await fetch("/api/users");
  return response.json();
}
