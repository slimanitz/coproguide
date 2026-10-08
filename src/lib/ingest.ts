import { eq, notInArray } from "drizzle-orm";
import { chunkArticle, chunkHeader, type TokenCounter } from "./chunking";
import { loadCorpus, sha256, type CorpusArticle } from "./corpus";
import type { Db } from "./db/client";
import { chunks, documents } from "./db/schema";
import { embedPassages, getTokenCounter } from "./embeddings";
import { env } from "./env";

export interface IngestReport {
  articles: number;
  inserted: number;
  updated: number;
  unchanged: number;
  removed: number;
  chunks: number;
  durationMs: number;
}

export interface IngestOptions {
  /** Remove documents that are no longer present in the corpus directory. */
  prune?: boolean;
  countTokens?: TokenCounter;
  log?: (message: string) => void;
}

/**
 * Everything that changes the stored chunks or vectors besides the article text. It is folded
 * into the stored hash, so changing the embedding model, its dtype or the chunk budget makes
 * every article "changed" and triggers a full re-ingestion.
 */
export function ingestFingerprint(): string {
  return JSON.stringify({
    model: env.embeddingModel,
    dtype: env.embeddingDtype,
    maxTokens: env.chunkMaxTokens,
    overlapTokens: env.chunkOverlapTokens,
    chunker: 1, // bump when the chunking algorithm changes
  });
}

export function storedHash(article: CorpusArticle, fingerprint = ingestFingerprint()): string {
  return sha256(`${article.contentHash}\n${fingerprint}`);
}

/**
 * Idempotent ingestion: each article's hash (text + metadata + ingest fingerprint) is compared
 * with the stored one; unchanged articles are skipped, changed ones are re-chunked and re-embedded.
 */
export async function ingestCorpus(db: Db, corpusDir: string, options: IngestOptions = {}): Promise<IngestReport> {
  const started = Date.now();
  const log = options.log ?? (() => undefined);
  const articles = await loadCorpus(corpusDir);
  const countTokens = options.countTokens ?? (await getTokenCounter());

  const existing = new Map(
    (await db.select({ id: documents.id, hash: documents.contentHash }).from(documents)).map((r) => [r.id, r.hash]),
  );

  const report: IngestReport = { articles: articles.length, inserted: 0, updated: 0, unchanged: 0, removed: 0, chunks: 0, durationMs: 0 };

  const fingerprint = ingestFingerprint();
  for (const article of articles) {
    const previous = existing.get(article.id);
    const hash = storedHash(article, fingerprint);
    if (previous === hash) {
      report.unchanged++;
      continue;
    }
    const written = await upsertArticle(db, article, hash, countTokens);
    report.chunks += written;
    if (previous) report.updated++;
    else report.inserted++;
    log(`${previous ? "updated " : "inserted"} ${article.id.padEnd(12)} ${written} chunk(s)`);
  }

  if (options.prune) {
    const ids = articles.map((a) => a.id);
    const removed = ids.length
      ? await db.delete(documents).where(notInArray(documents.id, ids)).returning({ id: documents.id })
      : await db.delete(documents).returning({ id: documents.id });
    report.removed = removed.length;
  }

  report.durationMs = Date.now() - started;
  return report;
}

async function upsertArticle(db: Db, article: CorpusArticle, hash: string, countTokens: TokenCounter): Promise<number> {
  const { meta } = article;
  const pieces = chunkArticle(
    { law: meta.law, article: meta.article, title: meta.title, content: article.content },
    { maxTokens: env.chunkMaxTokens, overlapTokens: env.chunkOverlapTokens, countTokens },
  );
  const vectors = await embedPassages(pieces.map((p) => p.content));

  await db.transaction(async (tx) => {
    const values = {
      id: article.id,
      lawCode: meta.law_code,
      law: meta.law,
      article: meta.article,
      title: meta.title,
      legifranceUrl: meta.legifrance_url,
      versionDate: meta.version_date,
      source: meta.source,
      content: article.content,
      contentHash: hash,
      updatedAt: new Date(),
    };
    await tx.insert(documents).values(values).onConflictDoUpdate({ target: documents.id, set: values });
    await tx.delete(chunks).where(eq(chunks.docId, article.id));
    await tx.insert(chunks).values(
      pieces.map((piece, i) => ({
        docId: article.id,
        chunkIndex: piece.chunkIndex,
        law: meta.law,
        article: meta.article,
        title: meta.title,
        content: piece.content,
        embedding: vectors[i],
        tokenCount: piece.tokenCount,
        contentHash: sha256(piece.content),
      })),
    );
  });
  return pieces.length;
}

export { chunkHeader };
