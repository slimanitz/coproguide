/** Sentinel the LLM must output when the provided extracts do not cover the question. */
export const OUT_OF_CORPUS_SENTINEL = "[HORS_CORPUS]";

export const REFUSAL_MESSAGE =
  "Je ne trouve pas de réponse fiable à cette question dans les textes dont je dispose (loi du 10 juillet 1965, décret du 17 mars 1967, loi du 6 juillet 1989). " +
  "Je préfère ne pas improviser : consultez le texte officiel sur [Légifrance](https://www.legifrance.gouv.fr) ou un conseiller juriste de l'[ANIL / ADIL](https://www.anil.org) près de chez vous.";

export type RefusalReason = "low_similarity" | "no_results" | "llm_out_of_corpus";

export interface GateDecision {
  pass: boolean;
  reason?: RefusalReason;
  bestSimilarity: number | null;
}

/** Retrieval-side confidence gate: refuse before calling the LLM when the best cosine similarity is too low. */
export function retrievalGate(bestSimilarity: number | null, minSimilarity: number): GateDecision {
  if (bestSimilarity === null) return { pass: false, reason: "no_results", bestSimilarity };
  if (bestSimilarity < minSimilarity) return { pass: false, reason: "low_similarity", bestSimilarity };
  return { pass: true, bestSimilarity };
}

/** Generation-side gate: the model declared the extracts insufficient. */
export function isOutOfCorpusAnswer(answer: string): boolean {
  return answer.includes(OUT_OF_CORPUS_SENTINEL);
}
