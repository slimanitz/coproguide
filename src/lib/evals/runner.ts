import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { answerQuestion, saveAssistantMessage, type AnswerResult } from "../chat";
import { citedNumbers } from "../citations";
import { costEur } from "../cost";
import type { Db } from "../db/client";
import { evalResults, evalRuns } from "../db/schema";
import { env } from "../env";
import type { Judge, LlmProvider } from "../llm/types";
import { retrievedArticleIds } from "../retrieval";
import type { GoldenQuestion } from "./golden";
import { aggregate, citationGroundedness, citationPrecision, recallAtK, type EvalMetrics, type QuestionOutcome } from "./metrics";

export interface EvalRunOptions {
  name: string;
  provider: LlmProvider;
  judge: Judge;
  questions: GoldenQuestion[];
  minSimilarity?: number;
  reportsDir?: string;
  onProgress?: (done: number, total: number, question: GoldenQuestion, outcome: QuestionOutcome) => void;
}

export interface EvalQuestionResult extends QuestionOutcome {
  id: string;
  question: string;
  expectedArticles: string[];
  retrievedArticles: string[];
  citedArticles: string[];
  answer: string;
  judgeRationale: string;
  bestSimilarity: number | null;
}

export interface EvalReport {
  runId: string;
  name: string;
  provider: string;
  model: string;
  judgeModel: string;
  minSimilarity: number;
  startedAt: string;
  finishedAt: string;
  metrics: EvalMetrics;
  results: EvalQuestionResult[];
}

async function drain(generator: AsyncGenerator<unknown, AnswerResult>): Promise<AnswerResult> {
  let step = await generator.next();
  while (!step.done) step = await generator.next();
  return step.value;
}

export async function createEvalRun(db: Db, name: string, provider: LlmProvider, judge: Judge, minSimilarity = env.minSimilarity) {
  const [run] = await db
    .insert(evalRuns)
    .values({ name, provider: provider.name, model: provider.model, judgeModel: judge.model, minSimilarity, status: "running" })
    .returning();
  return run;
}

/** Runs the golden set sequentially (keeps the CPU embedder and the API rate limits calm). */
export async function executeEvalRun(db: Db, runId: string, options: EvalRunOptions): Promise<EvalReport> {
  const minSimilarity = options.minSimilarity ?? env.minSimilarity;
  const startedAt = new Date();
  const results: EvalQuestionResult[] = [];

  try {
    for (const [index, q] of options.questions.entries()) {
      const result = await drain(answerQuestion({ db, provider: options.provider, minSimilarity, topK: 8 }, { question: q.question }));
      await saveAssistantMessage(db, result, { conversationId: null, origin: "eval", provider: options.provider.name });

      const retrieved = retrievedArticleIds(result.extracts);
      const retrievedTop5 = retrievedArticleIds(result.extracts.slice(0, 5));
      const cited = [...new Set(result.citations.map((c) => c.docId))];
      const verdict = await options.judge.judge({
        question: q.question,
        referenceAnswer: q.reference_answer,
        answer: result.answer,
        extracts: result.extracts,
        expectRefusal: q.category === "hors-corpus",
        refused: result.refused,
      });
      const judgeCost = costEur(verdict.usage, verdict.model, env.usdToEur);

      const outcome: EvalQuestionResult = {
        id: q.id,
        question: q.question,
        category: q.category,
        expectedArticles: q.expected_articles,
        retrievedArticles: retrieved,
        citedArticles: cited,
        answer: result.answer,
        refused: result.refused,
        bestSimilarity: result.bestSimilarity,
        recallAt5: recallAtK(q.expected_articles, retrievedTop5, 5),
        recallAt8: recallAtK(q.expected_articles, retrieved, 8),
        citationPrecision: result.refused ? null : citationPrecision(cited, q.expected_articles),
        citationGroundedness: result.refused ? null : citationGroundedness(citedNumbers(result.answer), result.extracts.length),
        judgeScore: verdict.score,
        judgeRationale: verdict.rationale,
        latencyMs: result.latencyMs,
        costEur: result.costEur + judgeCost,
      };
      results.push(outcome);

      await db.insert(evalResults).values({
        runId,
        questionId: q.id,
        question: q.question,
        category: q.category,
        expectedArticles: q.expected_articles,
        retrievedArticles: retrieved,
        citedArticles: cited,
        answer: result.answer,
        referenceAnswer: q.reference_answer,
        refused: result.refused,
        bestSimilarity: result.bestSimilarity,
        recallAt5: outcome.recallAt5,
        recallAt8: outcome.recallAt8,
        citationPrecision: outcome.citationPrecision,
        refusalCorrect: q.category === "hors-corpus" ? result.refused : !result.refused,
        judgeScore: verdict.score,
        judgeRationale: verdict.rationale,
        latencyMs: result.latencyMs,
        costEur: outcome.costEur,
      });
      options.onProgress?.(index + 1, options.questions.length, q, outcome);
    }

    const metrics = aggregate(results);
    const finishedAt = new Date();
    const report: EvalReport = {
      runId,
      name: options.name,
      provider: options.provider.name,
      model: options.provider.model,
      judgeModel: options.judge.model,
      minSimilarity,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      metrics,
      results,
    };
    const reportPath = options.reportsDir ? await writeReport(report, options.reportsDir) : null;
    await db.update(evalRuns).set({ status: "done", metrics, finishedAt, reportPath }).where(eq(evalRuns.id, runId));
    return report;
  } catch (error) {
    await db
      .update(evalRuns)
      .set({ status: "failed", error: (error as Error).message, finishedAt: new Date() })
      .where(eq(evalRuns.id, runId));
    throw error;
  }
}

const pct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)} %`);
const num = (v: number | null, digits = 2) => (v === null ? "n/a" : v.toFixed(digits));

export function renderMarkdown(report: EvalReport): string {
  const m = report.metrics;
  const rows = report.results.map(
    (r) =>
      `| ${r.id} | ${r.category} | ${r.question.replace(/\|/g, "\\|")} | ${r.expectedArticles.join(", ") || "—"} | ${r.citedArticles.join(", ") || (r.refused ? "refus" : "—")} | ${num(r.recallAt8, 2)} | ${r.judgeScore ?? "n/a"} | ${r.latencyMs} |`,
  );
  return `# Évaluation CoproGuide — ${report.name}

- Run : \`${report.runId}\`
- Fournisseur : **${report.provider}** (modèle \`${report.model}\`, juge \`${report.judgeModel}\`)
- Seuil de similarité : ${report.minSimilarity}
- Début : ${report.startedAt} — fin : ${report.finishedAt}

## Synthèse

| Métrique | Valeur |
|---|---|
| Questions | ${m.questions} |
| Rappel@5 (articles attendus retrouvés) | ${pct(m.recallAt5)} |
| Rappel@8 | ${pct(m.recallAt8)} |
| Précision des citations | ${pct(m.citationPrecision)} |
| Citations ancrées (numéros valides) | ${pct(m.citationGroundedness)} |
| Refus corrects (hors corpus) | ${pct(m.refusalAccuracy)} |
| Refus à tort (dans le corpus) | ${pct(m.falseRefusalRate)} |
| Note du juge (1-5) | ${num(m.judgeScore)} |
| Latence moyenne | ${Math.round(m.meanLatencyMs)} ms |
| Latence p95 | ${Math.round(m.p95LatencyMs)} ms |
| Coût total | ${m.totalCostEur.toFixed(4)} € |

## Détail par question

| id | catégorie | question | attendus | cités | rappel@8 | juge | latence (ms) |
|---|---|---|---|---|---|---|---|
${rows.join("\n")}
`;
}

export async function writeReport(report: EvalReport, dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const stamp = report.startedAt.replace(/[:.]/g, "-");
  const base = path.join(dir, stamp);
  await writeFile(`${base}.json`, JSON.stringify(report, null, 2) + "\n");
  await writeFile(`${base}.md`, renderMarkdown(report));
  return `${base}.json`;
}

/** Convenience: create the run row, then execute. */
export async function runEval(db: Db, options: EvalRunOptions): Promise<EvalReport> {
  const run = await createEvalRun(db, options.name, options.provider, options.judge, options.minSimilarity);
  return executeEvalRun(db, run.id, options);
}
