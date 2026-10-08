import { buildYoga } from "@/graphql/yoga";
import { getDb } from "@/lib/db/client";
import { startEvalJob } from "@/lib/eval-jobs";
import { createRepository } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const yoga = buildYoga(({ request }) => {
  const db = getDb();
  return {
    repo: createRepository(db),
    startEval: (name: string) => startEvalJob(db, name, request.headers.get("x-admin-token")),
  };
});

export async function GET(request: Request) {
  return yoga.handleRequest(request, {});
}

export async function POST(request: Request) {
  return yoga.handleRequest(request, {});
}

export async function OPTIONS(request: Request) {
  return yoga.handleRequest(request, {});
}
