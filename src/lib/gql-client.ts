/** Minimal browser GraphQL client for the /api/graphql endpoint. */
export async function gql<T>(query: string, variables?: Record<string, unknown>, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch("/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ query, variables }),
  });
  const payload = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (payload.errors?.length) throw new Error(payload.errors.map((e) => e.message).join("; "));
  if (!payload.data) throw new Error(`GraphQL request failed (${response.status})`);
  return payload.data;
}
