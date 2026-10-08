import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [row] = (await getDb().execute(sql`SELECT count(*)::int AS chunks FROM chunks`)) as unknown as { chunks: number }[];
    return Response.json({ status: "ok", provider: env.llmProvider, chunks: row.chunks });
  } catch (error) {
    return Response.json({ status: "error", message: (error as Error).message }, { status: 503 });
  }
}
