/**
 * Usage: pnpm calibrate [--holdout]
 * Retrieval-only sweep of RAG_MIN_SIMILARITY on the golden set. Prints the best cosine similarity
 * per class and, for each candidate threshold, the share of in-corpus questions kept and of
 * hors-corpus questions refused. The recommended threshold is the one refusing the most
 * hors-corpus questions while keeping 100 % of in-corpus ones.
 *   --holdout  calibrate on half of the golden set (stratified, deterministic) and report the
 *              chosen threshold on the other half, i.e. an unbiased estimate.
 */
import { closeDb, getDb } from "../src/lib/db/client";
import { candidateThresholds, pickThreshold, scoreThreshold, stratifiedSplit, type SimilaritySample } from "../src/lib/evals/calibration";
import { loadGolden } from "../src/lib/evals/golden";
import { hybridSearch } from "../src/lib/retrieval";

const holdoutMode = process.argv.includes("--holdout");
const pct = (x: number) => `${(x * 100).toFixed(1).padStart(5)} %`;

const samples: SimilaritySample[] = [];
for (const q of await loadGolden()) {
  const { bestSimilarity } = await hybridSearch(getDb(), q.question, 8);
  samples.push({ id: q.id, inCorpus: q.category !== "hors-corpus", best: bestSimilarity ?? 0 });
}
const fmt = (xs: SimilaritySample[]) => xs.map((x) => x.best.toFixed(3)).sort().join(" ");
console.log(`in-corpus best similarity:   ${fmt(samples.filter((s) => s.inCorpus))}`);
console.log(`hors-corpus best similarity: ${fmt(samples.filter((s) => !s.inCorpus))}`);

const candidates = candidateThresholds();
const { calibration, holdout } = holdoutMode ? stratifiedSplit(samples) : { calibration: samples, holdout: [] };

console.log(`\nSweep on ${holdoutMode ? "the calibration half" : "the full golden set"} (${calibration.length} questions)`);
console.log("threshold  in-corpus kept  hors-corpus refused");
for (const t of candidates) {
  const s = scoreThreshold(calibration, t);
  console.log(`  ${t.toFixed(3)}     ${pct(s.kept)}        ${pct(s.refused)}`);
}
const chosen = pickThreshold(calibration, candidates);
console.log(`\nRecommended threshold: ${chosen.threshold.toFixed(3)} (kept ${pct(chosen.kept)}, refused ${pct(chosen.refused)} on ${holdoutMode ? "calibration" : "all"} questions)`);

if (holdoutMode) {
  const result = scoreThreshold(holdout, chosen.threshold);
  const inside = holdout.filter((s) => s.inCorpus).length;
  const outside = holdout.length - inside;
  console.log(
    `Holdout (${inside} in-corpus, ${outside} hors-corpus): kept ${pct(result.kept)}, refused ${pct(result.refused)} at ${chosen.threshold.toFixed(3)}`,
  );
}
await closeDb();
