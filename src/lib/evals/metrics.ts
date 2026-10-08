/** Pure evaluation metrics (unit-tested). */

/** Share of expected articles found among the articles of the first k retrieved chunks. Null when nothing is expected. */
export function recallAtK(expected: string[], retrievedInOrder: string[], k: number): number | null {
  if (!expected.length) return null;
  const top = new Set(retrievedInOrder.slice(0, k));
  return expected.filter((id) => top.has(id)).length / expected.length;
}

/**
 * Citation precision: share of cited articles that are expected for the question.
 * Null when the answer cites nothing (refusals are scored by refusal accuracy instead).
 */
export function citationPrecision(cited: string[], expected: string[]): number | null {
  const unique = [...new Set(cited)];
  if (!unique.length || !expected.length) return null;
  const allowed = new Set(expected);
  return unique.filter((id) => allowed.has(id)).length / unique.length;
}

/** Share of [n] markers that point to an extract that was actually provided (hallucinated references lower it). */
export function citationGroundedness(citedNumbers: number[], extractCount: number): number | null {
  if (!citedNumbers.length) return null;
  return citedNumbers.filter((n) => n >= 1 && n <= extractCount).length / citedNumbers.length;
}

export interface QuestionOutcome {
  category: "copropriete" | "bail" | "hors-corpus";
  refused: boolean;
  recallAt5: number | null;
  recallAt8: number | null;
  citationPrecision: number | null;
  citationGroundedness: number | null;
  judgeScore: number | null;
  latencyMs: number;
  costEur: number;
}

export interface EvalMetrics {
  questions: number;
  recallAt5: number | null;
  recallAt8: number | null;
  citationPrecision: number | null;
  citationGroundedness: number | null;
  /** Share of hors-corpus questions correctly refused. */
  refusalAccuracy: number | null;
  /** Share of in-corpus questions wrongly refused. */
  falseRefusalRate: number | null;
  judgeScore: number | null;
  meanLatencyMs: number;
  p95LatencyMs: number;
  totalCostEur: number;
}

export function mean(values: (number | null)[]): number | null {
  const defined = values.filter((v): v is number => v !== null && Number.isFinite(v));
  return defined.length ? defined.reduce((a, b) => a + b, 0) / defined.length : null;
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export function aggregate(outcomes: QuestionOutcome[]): EvalMetrics {
  const outOfCorpus = outcomes.filter((o) => o.category === "hors-corpus");
  const inCorpus = outcomes.filter((o) => o.category !== "hors-corpus");
  const latencies = outcomes.map((o) => o.latencyMs);
  return {
    questions: outcomes.length,
    recallAt5: mean(inCorpus.map((o) => o.recallAt5)),
    recallAt8: mean(inCorpus.map((o) => o.recallAt8)),
    citationPrecision: mean(inCorpus.map((o) => o.citationPrecision)),
    citationGroundedness: mean(outcomes.map((o) => o.citationGroundedness)),
    refusalAccuracy: outOfCorpus.length ? outOfCorpus.filter((o) => o.refused).length / outOfCorpus.length : null,
    falseRefusalRate: inCorpus.length ? inCorpus.filter((o) => o.refused).length / inCorpus.length : null,
    judgeScore: mean(outcomes.map((o) => o.judgeScore)),
    meanLatencyMs: mean(latencies) ?? 0,
    p95LatencyMs: percentile(latencies, 95),
    totalCostEur: outcomes.reduce((sum, o) => sum + o.costEur, 0),
  };
}
