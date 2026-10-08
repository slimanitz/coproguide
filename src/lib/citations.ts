import type { Extract } from "./prompts";

export interface Citation {
  n: number;
  docId: string;
  chunkId: number;
  law: string;
  article: string;
  title: string;
  score: number;
  similarity: number;
}

/** Numbers referenced as [n] (also [1][2] and [1, 2]) in an answer, in order of first appearance. */
export function citedNumbers(answer: string): number[] {
  const seen = new Set<number>();
  for (const match of answer.matchAll(/\[(\d+(?:\s*[,;]\s*\d+)*)\]/g)) {
    for (const part of match[1].split(/[,;]/)) seen.add(Number(part.trim()));
  }
  return [...seen];
}

/** Maps [n] markers to the extracts that were actually provided; unknown numbers are dropped. */
export function resolveCitations(answer: string, extracts: Extract[]): Citation[] {
  const byNumber = new Map(extracts.map((e) => [e.n, e]));
  return citedNumbers(answer).flatMap((n) => {
    const e = byNumber.get(n);
    return e
      ? [{ n, docId: e.docId, chunkId: e.chunkId, law: e.law, article: e.article, title: e.title, score: e.score, similarity: e.similarity }]
      : [];
  });
}
