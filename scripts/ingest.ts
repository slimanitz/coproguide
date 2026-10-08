/**
 * Usage: pnpm ingest [--dir <corpus dir>] [--prune]
 *   --dir    corpus directory (default: corpus)
 *   --prune  delete documents (and their chunks) that are no longer present in the directory
 * Parses the Markdown corpus, chunks, embeds (e5, local) and upserts into Postgres.
 * Idempotent: articles whose text, metadata and ingest settings are unchanged are skipped.
 */
import path from "node:path";
import { closeDb, getDb } from "../src/lib/db/client";
import { runMigrations } from "../src/lib/db/migrate";
import { env } from "../src/lib/env";
import { ingestCorpus } from "../src/lib/ingest";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: pnpm ingest [--dir <corpus dir>] [--prune]\n  --prune  delete documents no longer present in the corpus directory");
  process.exit(0);
}
const dirIndex = args.indexOf("--dir");
const dir = path.resolve(dirIndex >= 0 ? args[dirIndex + 1] : "corpus");

await runMigrations(env.databaseUrl);
const report = await ingestCorpus(getDb(), dir, { prune: args.includes("--prune"), log: console.log });
console.log(
  `Ingest done in ${report.durationMs} ms: ${report.articles} articles (${report.inserted} inserted, ${report.updated} updated, ${report.unchanged} unchanged, ${report.removed} removed), ${report.chunks} chunks written.`,
);
await closeDb();
