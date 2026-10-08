import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { citations, conversations, documents, evalResults, evalRuns, messages } from "./db/schema";
import type { DocumentRow, EvalResultRow, EvalRunRow } from "./db/schema";
import { hybridSearch, type SearchHit } from "./retrieval";

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

export interface MessageWithCitations {
  id: string;
  role: string;
  content: string;
  refused: boolean;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  latencyMs: number | null;
  costEur: number;
  createdAt: Date;
  citations: { n: number; docId: string; score: number }[];
}

export interface DailyMetrics {
  day: string;
  requests: number;
  costEur: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface MetricsTotals {
  requests: number;
  refusals: number;
  totalCostEur: number;
  avgLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheHitRate: number;
}

export interface Metrics {
  from: Date;
  to: Date;
  totals: MetricsTotals;
  byDay: DailyMetrics[];
}

export interface Page {
  limit: number;
  offset: number;
}

const DEFAULT_PAGE: Page = { limit: 50, offset: 0 };

/** Data access used by GraphQL resolvers and server components (mockable in tests). */
export interface Repository {
  listConversations(page?: Page): Promise<ConversationSummary[]>;
  getConversation(id: string): Promise<(ConversationSummary & { messages: MessageWithCitations[] }) | null>;
  createConversation(title: string): Promise<ConversationSummary>;
  deleteConversation(id: string): Promise<boolean>;
  listDocuments(lawCode?: string | null): Promise<DocumentRow[]>;
  getDocument(id: string): Promise<DocumentRow | null>;
  getDocuments(ids: string[]): Promise<DocumentRow[]>;
  search(query: string, k: number): Promise<SearchHit[]>;
  listEvalRuns(page?: Page): Promise<EvalRunRow[]>;
  getEvalRun(id: string): Promise<EvalRunRow | null>;
  listEvalResults(runId: string): Promise<EvalResultRow[]>;
  metrics(from: Date, to: Date): Promise<Metrics>;
}

const n = (v: unknown) => Number(v ?? 0);

export function createRepository(db: Db): Repository {
  return {
    async listConversations(page = DEFAULT_PAGE) {
      const rows = await db
        .select({
          id: conversations.id,
          title: conversations.title,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
          messageCount: sql<number>`count(${messages.id})::int`,
        })
        .from(conversations)
        .leftJoin(messages, eq(messages.conversationId, conversations.id))
        .groupBy(conversations.id)
        .orderBy(desc(conversations.updatedAt))
        .limit(page.limit)
        .offset(page.offset);
      return rows;
    },

    async getConversation(id) {
      const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
      if (!conversation) return null;
      const rows = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));
      const cites = rows.length
        ? await db
            .select()
            .from(citations)
            .where(inArray(citations.messageId, rows.map((r) => r.id)))
            .orderBy(asc(citations.n))
        : [];
      return {
        ...conversation,
        messageCount: rows.length,
        messages: rows.map((m) => ({
          ...m,
          citations: cites.filter((c) => c.messageId === m.id).map((c) => ({ n: c.n, docId: c.docId, score: c.score })),
        })),
      };
    },

    async createConversation(title) {
      const [row] = await db.insert(conversations).values({ title }).returning();
      return { ...row, messageCount: 0 };
    },

    async deleteConversation(id) {
      const deleted = await db.delete(conversations).where(eq(conversations.id, id)).returning({ id: conversations.id });
      return deleted.length > 0;
    },

    async listDocuments(lawCode) {
      const rows = await db
        .select()
        .from(documents)
        .where(lawCode ? eq(documents.lawCode, lawCode) : undefined);
      return rows.sort((a, b) => a.lawCode.localeCompare(b.lawCode) || compareArticles(a.article, b.article));
    },

    async getDocument(id) {
      const [row] = await db.select().from(documents).where(eq(documents.id, id));
      return row ?? null;
    },

    async getDocuments(ids) {
      if (!ids.length) return [];
      return db.select().from(documents).where(inArray(documents.id, ids));
    },

    async search(query, k) {
      return (await hybridSearch(db, query, k)).hits;
    },

    async listEvalRuns(page = DEFAULT_PAGE) {
      return db.select().from(evalRuns).orderBy(desc(evalRuns.startedAt)).limit(page.limit).offset(page.offset);
    },

    async getEvalRun(id) {
      const [row] = await db.select().from(evalRuns).where(eq(evalRuns.id, id));
      return row ?? null;
    },

    async listEvalResults(runId) {
      return db.select().from(evalResults).where(eq(evalResults.runId, runId)).orderBy(asc(evalResults.questionId));
    },

    async metrics(from, to) {
      const where = and(eq(messages.role, "assistant"), gte(messages.createdAt, from), lt(messages.createdAt, to));
      const [totals] = await db
        .select({
          requests: sql<number>`count(*)::int`,
          refusals: sql<number>`count(*) filter (where ${messages.refused})::int`,
          totalCostEur: sql<number>`coalesce(sum(${messages.costEur}), 0)`,
          avgLatencyMs: sql<number>`coalesce(avg(${messages.latencyMs}), 0)`,
          inputTokens: sql<number>`coalesce(sum(${messages.inputTokens}), 0)::bigint`,
          outputTokens: sql<number>`coalesce(sum(${messages.outputTokens}), 0)::bigint`,
          cacheReadTokens: sql<number>`coalesce(sum(${messages.cacheReadTokens}), 0)::bigint`,
          cacheWriteTokens: sql<number>`coalesce(sum(${messages.cacheWriteTokens}), 0)::bigint`,
        })
        .from(messages)
        .where(where);
      const byDay = await db
        .select({
          day: sql<string>`to_char(date_trunc('day', ${messages.createdAt} AT TIME ZONE 'Europe/Paris'), 'YYYY-MM-DD')`,
          requests: sql<number>`count(*)::int`,
          costEur: sql<number>`coalesce(sum(${messages.costEur}), 0)`,
          p50LatencyMs: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${messages.latencyMs}), 0)`,
          p95LatencyMs: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${messages.latencyMs}), 0)`,
          inputTokens: sql<number>`coalesce(sum(${messages.inputTokens}), 0)::bigint`,
          outputTokens: sql<number>`coalesce(sum(${messages.outputTokens}), 0)::bigint`,
          cacheReadTokens: sql<number>`coalesce(sum(${messages.cacheReadTokens}), 0)::bigint`,
          cacheWriteTokens: sql<number>`coalesce(sum(${messages.cacheWriteTokens}), 0)::bigint`,
        })
        .from(messages)
        .where(where)
        .groupBy(sql`1`)
        .orderBy(sql`1`);

      const t = {
        requests: n(totals.requests),
        refusals: n(totals.refusals),
        totalCostEur: n(totals.totalCostEur),
        avgLatencyMs: n(totals.avgLatencyMs),
        inputTokens: n(totals.inputTokens),
        outputTokens: n(totals.outputTokens),
        cacheReadTokens: n(totals.cacheReadTokens),
        cacheWriteTokens: n(totals.cacheWriteTokens),
        cacheHitRate: 0,
      };
      const prompt = t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens;
      t.cacheHitRate = prompt ? t.cacheReadTokens / prompt : 0;
      return {
        from,
        to,
        totals: t,
        byDay: byDay.map((d) => ({
          day: d.day,
          requests: n(d.requests),
          costEur: n(d.costEur),
          p50LatencyMs: n(d.p50LatencyMs),
          p95LatencyMs: n(d.p95LatencyMs),
          inputTokens: n(d.inputTokens),
          outputTokens: n(d.outputTokens),
          cacheReadTokens: n(d.cacheReadTokens),
          cacheWriteTokens: n(d.cacheWriteTokens),
        })),
      };
    },
  };
}

/** Natural order for article numbers: "2" < "10" < "14-1" < "14-2" < "14-2-1" < "25". */
export function compareArticles(a: string, b: string): number {
  const parts = (s: string) => s.replace(/^\D+/, "").split("-").map(Number);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return 0;
}
