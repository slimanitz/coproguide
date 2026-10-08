import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { evalRuns } from "./db/schema";
import { env } from "./env";
import { checkEvalStart } from "./eval-guard";
import { loadGolden } from "./evals/golden";
import { createEvalRun, executeEvalRun } from "./evals/runner";
import { createJudge, createProvider } from "./llm";

/** Runs still "running" after this long are considered crashed and do not block new runs. */
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

// In-memory, per-process state (good enough for a single-instance deployment).
const state = globalThis as unknown as { __coproguideEvalStarts?: number[]; __coproguideEvalStarting?: boolean };
state.__coproguideEvalStarts ??= [];

/**
 * Starts an evaluation run in the background of the server process and returns its id
 * immediately; progress is observable through eval_runs.status / evalRun(id).
 * Guarded: admin token with the paid provider, single flight, rate limit (see eval-guard.ts).
 */
export async function startEvalJob(db: Db, name: string, adminToken?: string | null): Promise<string> {
  if (state.__coproguideEvalStarting) {
    checkEvalStart({ ...guardBase(adminToken), runningRuns: 1 });
  }
  state.__coproguideEvalStarting = true;
  try {
    const [{ running }] = await db
      .select({ running: sql<number>`count(*)::int` })
      .from(evalRuns)
      .where(and(eq(evalRuns.status, "running"), gte(evalRuns.startedAt, new Date(Date.now() - STALE_AFTER_MS))));
    state.__coproguideEvalStarts = checkEvalStart({ ...guardBase(adminToken), runningRuns: running });

    const provider = createProvider();
    const judge = createJudge();
    const questions = await loadGolden();
    const run = await createEvalRun(db, name, provider, judge, env.minSimilarity);
    state.__coproguideEvalStarts.push(Date.now());
    void executeEvalRun(db, run.id, { name, provider, judge, questions, reportsDir: "evals/reports" }).catch((error) =>
      console.error(`[eval ${run.id}] failed:`, error),
    );
    return run.id;
  } finally {
    state.__coproguideEvalStarting = false;
  }
}

function guardBase(adminToken?: string | null) {
  return {
    provider: env.llmProvider,
    configuredToken: env.adminToken,
    providedToken: adminToken,
    recentStarts: state.__coproguideEvalStarts ?? [],
    now: Date.now(),
    maxRunsPerWindow: env.evalRateLimit,
    windowMs: 60 * 60 * 1000,
  };
}
