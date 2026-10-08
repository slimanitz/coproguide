/** Threshold calibration helpers for the retrieval confidence gate (pure, unit-tested). */
export interface SimilaritySample {
  id: string;
  inCorpus: boolean;
  best: number;
}

export interface ThresholdScore {
  threshold: number;
  /** Share of in-corpus questions that pass the gate. */
  kept: number;
  /** Share of hors-corpus questions refused by the gate. */
  refused: number;
  balanced: number;
}

export function scoreThreshold(samples: SimilaritySample[], threshold: number): ThresholdScore {
  const inside = samples.filter((s) => s.inCorpus);
  const outside = samples.filter((s) => !s.inCorpus);
  const kept = inside.length ? inside.filter((s) => s.best >= threshold).length / inside.length : 0;
  const refused = outside.length ? outside.filter((s) => s.best < threshold).length / outside.length : 0;
  return { threshold, kept, refused, balanced: (kept + refused) / 2 };
}

/**
 * Picks the threshold that refuses the most hors-corpus questions while keeping at least
 * `minKept` of the in-corpus ones (wrongly refusing a legitimate question is the costlier error).
 */
export function pickThreshold(samples: SimilaritySample[], candidates: number[], minKept = 1): ThresholdScore {
  const scored = candidates.map((t) => scoreThreshold(samples, t));
  const admissible = scored.filter((s) => s.kept >= minKept - 1e-9);
  const pool = admissible.length ? admissible : scored;
  return pool.reduce((best, s) => (s.refused > best.refused || (s.refused === best.refused && s.threshold > best.threshold) ? s : best));
}

/**
 * Deterministic stratified split: within each class (in-corpus / hors-corpus), samples sorted by
 * id alternate between the calibration set and the holdout set.
 */
export function stratifiedSplit<T extends { id: string; inCorpus: boolean }>(samples: T[]): { calibration: T[]; holdout: T[] } {
  const calibration: T[] = [];
  const holdout: T[] = [];
  for (const inCorpus of [true, false]) {
    samples
      .filter((s) => s.inCorpus === inCorpus)
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((s, i) => (i % 2 === 0 ? calibration : holdout).push(s));
  }
  return { calibration, holdout };
}

export function candidateThresholds(from = 0.78, to = 0.9, step = 0.005): number[] {
  const out: number[] = [];
  for (let t = from; t <= to + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000);
  return out;
}
