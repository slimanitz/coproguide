import { sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { embedQuery } from "./embeddings";
import { reciprocalRankFusion } from "./rrf";

export interface SearchHit {
  chunkId: number;
  docId: string;
  law: string;
  article: string;
  title: string;
  content: string;
  /** RRF score (higher is better). */
  score: number;
  /** Cosine similarity to the query embedding (always computed, even for full-text-only hits). */
  similarity: number;
  vectorRank: number | null;
  textRank: number | null;
}

export interface SearchResult {
  hits: SearchHit[];
  /** Best cosine similarity among vector candidates: input of the confidence gate. */
  bestSimilarity: number | null;
}

const CANDIDATES = 20;

interface CandidateRow {
  id: number;
  doc_id: string;
  law: string;
  article: string;
  title: string;
  content: string;
  similarity: number;
  [key: string]: unknown;
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

/**
 * Hybrid retrieval: top-20 by cosine distance (HNSW) ∪ top-20 by French full-text rank
 * (ts_rank_cd), fused with Reciprocal Rank Fusion (k = 60), truncated to k.
 * Full-text uses an OR of the stemmed query terms (plainto_tsquery ANDs every term,
 * which empties the result for natural-language questions).
 */
export async function hybridSearch(db: Db, query: string, k = 8, queryEmbedding?: number[]): Promise<SearchResult> {
  const vector = toVectorLiteral(queryEmbedding ?? (await embedQuery(query)));

  const vectorRows = (await db.execute(sql`
    SELECT id, doc_id, law, article, title, content,
           1 - (embedding <=> ${vector}::vector) AS similarity
    FROM chunks
    ORDER BY embedding <=> ${vector}::vector
    LIMIT ${CANDIDATES}
  `)) as unknown as CandidateRow[];

  const textRows = (await db.execute(sql`
    WITH q AS (
      SELECT CASE WHEN numnode(plainto_tsquery('french', ${query})) = 0 THEN NULL
             ELSE to_tsquery('french', replace(plainto_tsquery('french', ${query})::text, ' & ', ' | ')) END AS tsq
    )
    SELECT c.id, c.doc_id, c.law, c.article, c.title, c.content,
           1 - (c.embedding <=> ${vector}::vector) AS similarity,
           ts_rank_cd(c.content_tsv, q.tsq) AS text_score
    FROM chunks c, q
    WHERE q.tsq IS NOT NULL AND c.content_tsv @@ q.tsq
    ORDER BY text_score DESC, c.id
    LIMIT ${CANDIDATES}
  `)) as unknown as CandidateRow[];

  const fused = reciprocalRankFusion(
    [
      { name: "vector", items: vectorRows },
      { name: "text", items: textRows },
    ],
    (row) => row.id,
  );

  const hits: SearchHit[] = fused.slice(0, k).map(({ item, score, ranks }) => ({
    chunkId: Number(item.id),
    docId: item.doc_id,
    law: item.law,
    article: item.article,
    title: item.title,
    content: item.content,
    score,
    similarity: Number(item.similarity),
    vectorRank: ranks.vector ?? null,
    textRank: ranks.text ?? null,
  }));

  return { hits, bestSimilarity: vectorRows.length ? Number(vectorRows[0].similarity) : null };
}

/** Distinct article ids in retrieval order (several chunks can belong to one article). */
export function retrievedArticleIds(hits: Pick<SearchHit, "docId">[]): string[] {
  return [...new Set(hits.map((h) => h.docId))];
}
