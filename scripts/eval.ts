/**
 * pnpm eval [--name <run name>] [--provider mock|openai|anthropic] [--limit <n>] [--min-similarity <x>]
 * Runs the golden set (evals/golden.jsonl) against the configured provider, stores the run
 * in eval_runs / eval_results and writes evals/reports/<timestamp>.json + .md.
 */
import { closeDb, getDb } from "../src/lib/db/client";
import { runMigrations } from "../src/lib/db/migrate";
import { env, type LlmProviderName } from "../src/lib/env";
import { loadGolden } from "../src/lib/evals/golden";
import { runEval } from "../src/lib/evals/runner";
import { createJudge, createProvider } from "../src/lib/llm";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const providerName = (arg("provider") ?? env.llmProvider) as LlmProviderName;
const requiredKey: Record<string, string | undefined> = { openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY" };
const keyName = requiredKey[providerName];
if (keyName && !process.env[keyName]) {
  console.error(`LLM_PROVIDER=${providerName} requires ${keyName}. Use --provider mock for an offline run.`);
  process.exit(1);
}
process.env.MOCK_STREAM_DELAY_MS ??= "0";

const limit = arg("limit") ? Number(arg("limit")) : undefined;
const questions = (await loadGolden()).slice(0, limit);
const name = arg("name") ?? `${providerName}-${new Date().toISOString().slice(0, 16)}`;
const minSimilarity = arg("min-similarity") ? Number(arg("min-similarity")) : env.minSimilarity;

await runMigrations(env.databaseUrl);
console.log(`Running eval "${name}" on ${questions.length} questions with provider=${providerName}, min similarity=${minSimilarity}`);

const report = await runEval(getDb(), {
  name,
  provider: createProvider(providerName),
  judge: createJudge(providerName),
  questions,
  minSimilarity,
  reportsDir: "evals/reports",
  onProgress: (done, total, q, o) => {
    const flag = o.category === "hors-corpus" ? (o.refused ? "refus ok" : "REFUS MANQUÉ") : o.refused ? "REFUS À TORT" : `rappel@8=${o.recallAt8?.toFixed(2)}`;
    console.log(`[${String(done).padStart(2)}/${total}] ${q.id} ${flag.padEnd(14)} juge=${o.judgeScore} ${o.latencyMs} ms`);
  },
});

const m = report.metrics;
const pct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);
console.log(`
Run ${report.runId}
  recall@5            ${pct(m.recallAt5)}
  recall@8            ${pct(m.recallAt8)}
  citation precision  ${pct(m.citationPrecision)}
  refusal accuracy    ${pct(m.refusalAccuracy)}  (false refusals: ${pct(m.falseRefusalRate)})
  judge score         ${m.judgeScore?.toFixed(2) ?? "n/a"} / 5
  mean latency        ${Math.round(m.meanLatencyMs)} ms (p95 ${Math.round(m.p95LatencyMs)} ms)
  total cost          ${m.totalCostEur.toFixed(4)} €
Report written to evals/reports/`);
await closeDb();
