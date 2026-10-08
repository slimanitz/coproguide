/**
 * Downloads and caches the embedding model (used at Docker build time and in CI), then reports
 * the cold load time and the warm latency of a query embedding (median and p95 of 20 runs).
 */
import { embedQuery } from "../src/lib/embeddings";

const started = performance.now();
const vector = await embedQuery("Quelle majorité pour voter des travaux ?");
const coldMs = performance.now() - started;

const questions = [
  "Quel est le préavis du locataire pour quitter un logement vide ?",
  "Dans quel délai contester une décision d'assemblée générale ?",
  "Quel dépôt de garantie pour un logement meublé ?",
  "Qu'est-ce que l'état daté lors de la vente d'un lot ?",
];
const timings: number[] = [];
for (let i = 0; i < 20; i++) {
  const t = performance.now();
  await embedQuery(questions[i % questions.length]);
  timings.push(performance.now() - t);
}
timings.sort((a, b) => a - b);
const median = timings[Math.floor(timings.length / 2)];
const p95 = timings[Math.ceil(timings.length * 0.95) - 1];
console.log(
  `Embedding model ready: ${vector.length} dimensions; cold load + first query ${Math.round(coldMs)} ms; warm query median ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms (20 runs)`,
);
