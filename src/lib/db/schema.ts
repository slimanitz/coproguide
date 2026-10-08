import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const EMBEDDING_DIMENSIONS = 384;

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/** One row per legal article (a "document"). id = "<lawCode>:<articleNumber>", e.g. "65-557:25". */
export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  lawCode: text("law_code").notNull(),
  law: text("law").notNull(),
  article: text("article").notNull(),
  title: text("title").notNull(),
  legifranceUrl: text("legifrance_url").notNull(),
  versionDate: text("version_date").notNull(),
  source: text("source").notNull(),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chunks = pgTable(
  "chunks",
  {
    id: serial("id").primaryKey(),
    docId: text("doc_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    law: text("law").notNull(),
    article: text("article").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    contentTsv: tsvector("content_tsv").generatedAlwaysAs(
      sql`setweight(to_tsvector('french'::regconfig, coalesce(title, '') || ' ' || coalesce(article, '')), 'A') || setweight(to_tsvector('french'::regconfig, content), 'B')`,
    ),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    tokenCount: integer("token_count").notNull(),
    contentHash: text("content_hash").notNull(),
  },
  (t) => [
    uniqueIndex("chunks_doc_chunk_idx").on(t.docId, t.chunkIndex),
    index("chunks_embedding_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("chunks_content_tsv_gin_idx").using("gin", t.contentTsv),
  ],
);

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Messages of a conversation. Assistant messages carry the LLM usage, so this table is
 * also the ledger the dashboard aggregates. Eval answers are stored with origin = 'eval'
 * and no conversation.
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    origin: text("origin").notNull().default("chat"),
    role: text("role").notNull(),
    content: text("content").notNull(),
    refused: boolean("refused").notNull().default(false),
    refusalReason: text("refusal_reason"),
    provider: text("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    latencyMs: integer("latency_ms"),
    costEur: doublePrecision("cost_eur").notNull().default(0),
    bestSimilarity: doublePrecision("best_similarity"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId), index("messages_created_idx").on(t.createdAt)],
);

export const citations = pgTable(
  "citations",
  {
    id: serial("id").primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    n: integer("n").notNull(),
    docId: text("doc_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkId: integer("chunk_id"),
    score: doublePrecision("score").notNull(),
  },
  (t) => [index("citations_message_idx").on(t.messageId)],
);

export const evalRuns = pgTable("eval_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: text("status").notNull().default("running"),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  judgeModel: text("judge_model").notNull(),
  minSimilarity: doublePrecision("min_similarity").notNull(),
  metrics: jsonb("metrics"),
  reportPath: text("report_path"),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const evalResults = pgTable(
  "eval_results",
  {
    id: serial("id").primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => evalRuns.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    question: text("question").notNull(),
    category: text("category").notNull(),
    expectedArticles: jsonb("expected_articles").$type<string[]>().notNull(),
    retrievedArticles: jsonb("retrieved_articles").$type<string[]>().notNull(),
    citedArticles: jsonb("cited_articles").$type<string[]>().notNull(),
    answer: text("answer").notNull(),
    referenceAnswer: text("reference_answer").notNull(),
    refused: boolean("refused").notNull(),
    bestSimilarity: doublePrecision("best_similarity"),
    recallAt5: doublePrecision("recall_at5"),
    recallAt8: doublePrecision("recall_at8"),
    citationPrecision: doublePrecision("citation_precision"),
    refusalCorrect: boolean("refusal_correct").notNull(),
    judgeScore: doublePrecision("judge_score"),
    judgeRationale: text("judge_rationale"),
    latencyMs: integer("latency_ms").notNull(),
    costEur: doublePrecision("cost_eur").notNull(),
  },
  (t) => [index("eval_results_run_idx").on(t.runId)],
);

export type DocumentRow = typeof documents.$inferSelect;
export type ChunkRow = typeof chunks.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type EvalRunRow = typeof evalRuns.$inferSelect;
export type EvalResultRow = typeof evalResults.$inferSelect;
