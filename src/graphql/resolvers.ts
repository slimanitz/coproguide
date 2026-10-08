import { createGraphQLError } from "graphql-yoga";
import type { DocumentRow, EvalRunRow } from "@/lib/db/schema";
import type { ConversationSummary, MessageWithCitations, Repository } from "@/lib/repo";
import type { SearchHit } from "@/lib/retrieval";
import { stripHeader } from "@/lib/prompts";
import { EvalGuardError } from "@/lib/eval-guard";

export interface GraphQLContext {
  repo: Repository;
  /** Starts an eval run; throws EvalGuardError when refused (auth, single flight, rate limit). */
  startEval: (name: string) => Promise<string>;
}

const MAX_PAGE = 100;

function page(args: { limit?: number | null; offset?: number | null }, fallback = 50) {
  const limit = args.limit ?? fallback;
  const offset = args.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE) {
    throw createGraphQLError(`limit must be between 1 and ${MAX_PAGE}`, { extensions: { code: "BAD_USER_INPUT" } });
  }
  if (!Number.isInteger(offset) || offset < 0) throw createGraphQLError("offset must be >= 0", { extensions: { code: "BAD_USER_INPUT" } });
  return { limit, offset };
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
const DAY = 24 * 60 * 60 * 1000;

function parseDate(value: string | null | undefined, fallback: Date, field: string): Date {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw createGraphQLError(`Invalid date for ${field}: ${value}`, { extensions: { code: "BAD_USER_INPUT" } });
  return date;
}

export const resolvers = {
  Query: {
    conversations: (_: unknown, args: { limit?: number | null; offset?: number | null }, { repo }: GraphQLContext) =>
      repo.listConversations(page(args)),
    conversation: (_: unknown, { id }: { id: string }, { repo }: GraphQLContext) => repo.getConversation(id),
    documents: (_: unknown, { law }: { law?: string | null }, { repo }: GraphQLContext) => repo.listDocuments(law),
    document: (_: unknown, { id }: { id: string }, { repo }: GraphQLContext) => repo.getDocument(id),
    search: (_: unknown, { query, k }: { query: string; k?: number | null }, { repo }: GraphQLContext) => {
      const limit = k ?? 8;
      if (limit < 1 || limit > 20) throw createGraphQLError("k must be between 1 and 20", { extensions: { code: "BAD_USER_INPUT" } });
      if (!query.trim()) throw createGraphQLError("query must not be empty", { extensions: { code: "BAD_USER_INPUT" } });
      return repo.search(query, limit);
    },
    evalRuns: (_: unknown, args: { limit?: number | null; offset?: number | null }, { repo }: GraphQLContext) =>
      repo.listEvalRuns(page(args)),
    evalRun: (_: unknown, { id }: { id: string }, { repo }: GraphQLContext) => repo.getEvalRun(id),
    metrics: async (_: unknown, args: { from?: string | null; to?: string | null }, { repo }: GraphQLContext) => {
      const to = parseDate(args.to, new Date(Date.now() + DAY), "to");
      const from = parseDate(args.from, new Date(to.getTime() - 31 * DAY), "from");
      if (from >= to) throw createGraphQLError("from must be before to", { extensions: { code: "BAD_USER_INPUT" } });
      return repo.metrics(from, to);
    },
  },

  Mutation: {
    createConversation: (_: unknown, { title }: { title?: string | null }, { repo }: GraphQLContext) =>
      repo.createConversation(title?.trim() || "Nouvelle conversation"),
    deleteConversation: (_: unknown, { id }: { id: string }, { repo }: GraphQLContext) => repo.deleteConversation(id),
    runEval: async (_: unknown, { name }: { name?: string | null }, { startEval }: GraphQLContext) => {
      try {
        return await startEval(name?.trim() || `graphql-${new Date().toISOString().slice(0, 16)}`);
      } catch (error) {
        if (error instanceof EvalGuardError) throw createGraphQLError(error.message, { extensions: { code: error.code } });
        throw error;
      }
    },
  },

  Conversation: {
    createdAt: (c: ConversationSummary) => iso(c.createdAt),
    updatedAt: (c: ConversationSummary) => iso(c.updatedAt),
    messages: async (
      c: ConversationSummary & { messages?: MessageWithCitations[] },
      args: { limit?: number | null; offset?: number | null },
      { repo }: GraphQLContext,
    ) => {
      const { limit, offset } = page(args, MAX_PAGE);
      const all = c.messages ?? (await repo.getConversation(c.id))?.messages ?? [];
      return all.slice(offset, offset + limit);
    },
  },

  Message: {
    createdAt: (m: MessageWithCitations) => iso(m.createdAt),
  },

  Citation: {
    document: (c: { docId: string }, _: unknown, { repo }: GraphQLContext) => repo.getDocument(c.docId),
  },

  SearchHit: {
    excerpt: (h: SearchHit) => stripHeader(h.content).slice(0, 400),
    document: (h: SearchHit, _: unknown, { repo }: GraphQLContext) => repo.getDocument(h.docId),
  },

  Document: {
    versionDate: (d: DocumentRow) => d.versionDate,
  },

  EvalRun: {
    startedAt: (r: EvalRunRow) => iso(r.startedAt),
    finishedAt: (r: EvalRunRow) => iso(r.finishedAt),
    results: (r: EvalRunRow, _: unknown, { repo }: GraphQLContext) => repo.listEvalResults(r.id),
  },

  Metrics: {
    from: (m: { from: Date }) => iso(m.from),
    to: (m: { to: Date }) => iso(m.to),
    requests: (m: { totals: { requests: number } }) => m.totals.requests,
    refusals: (m: { totals: { refusals: number } }) => m.totals.refusals,
    totalCostEur: (m: { totals: { totalCostEur: number } }) => m.totals.totalCostEur,
    avgLatencyMs: (m: { totals: { avgLatencyMs: number } }) => m.totals.avgLatencyMs,
    inputTokens: (m: { totals: { inputTokens: number } }) => m.totals.inputTokens,
    outputTokens: (m: { totals: { outputTokens: number } }) => m.totals.outputTokens,
    cacheReadTokens: (m: { totals: { cacheReadTokens: number } }) => m.totals.cacheReadTokens,
    cacheWriteTokens: (m: { totals: { cacheWriteTokens: number } }) => m.totals.cacheWriteTokens,
    cacheHitRate: (m: { totals: { cacheHitRate: number } }) => m.totals.cacheHitRate,
    costByDay: (m: { byDay: unknown[] }) => m.byDay,
  },
};
