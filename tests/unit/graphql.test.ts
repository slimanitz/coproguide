import { describe, expect, it, vi } from "vitest";
import type { DocumentRow, EvalRunRow } from "@/lib/db/schema";
import type { Repository } from "@/lib/repo";
import type { GraphQLContext } from "@/graphql/resolvers";
import { buildYoga } from "@/graphql/yoga";
import { EvalGuardError } from "@/lib/eval-guard";

const doc: DocumentRow = {
  id: "65-557:25",
  lawCode: "65-557",
  law: "Loi n° 65-557 du 10 juillet 1965",
  article: "Article 25",
  title: "Majorité absolue",
  legifranceUrl: "https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006068256",
  versionDate: "2025-01-01",
  source: "manual-extract",
  content: "Ne sont adoptées qu'à la majorité des voix de tous les copropriétaires…",
  contentHash: "h",
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const run: EvalRunRow = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "mock-run",
  status: "done",
  provider: "mock",
  model: "mock-claude-sonnet-5-5",
  judgeModel: "mock-judge",
  minSimilarity: 0.83,
  metrics: { questions: 50, recallAt5: 0.9, recallAt8: 0.93, citationPrecision: 0.5, citationGroundedness: 1, refusalAccuracy: 0.8, falseRefusalRate: 0.02, judgeScore: 3.8, meanLatencyMs: 80, p95LatencyMs: 120, totalCostEur: 0.3 },
  reportPath: null,
  error: null,
  startedAt: new Date("2026-10-08T10:00:00Z"),
  finishedAt: new Date("2026-10-08T10:01:00Z"),
};

function fakeRepo(overrides: Partial<Repository> = {}): Repository {
  const now = new Date("2026-10-08T12:00:00Z");
  return {
    listConversations: vi.fn(async () => [{ id: "c1", title: "Travaux", createdAt: now, updatedAt: now, messageCount: 2 }]),
    getConversation: vi.fn(async (id: string) =>
      id === "c1"
        ? {
            id: "c1",
            title: "Travaux",
            createdAt: now,
            updatedAt: now,
            messageCount: 1,
            messages: [
              {
                id: "m1",
                role: "assistant",
                content: "Majorité de l'article 25 [1].",
                refused: false,
                model: "mock-claude-sonnet-5-5",
                inputTokens: 2000,
                outputTokens: 200,
                cacheReadTokens: 700,
                cacheWriteTokens: 0,
                latencyMs: 900,
                costEur: 0.004,
                createdAt: now,
                citations: [{ n: 1, docId: "65-557:25", score: 0.03 }],
              },
            ],
          }
        : null,
    ),
    createConversation: vi.fn(async (title: string) => ({ id: "c2", title, createdAt: now, updatedAt: now, messageCount: 0 })),
    deleteConversation: vi.fn(async () => true),
    listDocuments: vi.fn(async () => [doc]),
    getDocument: vi.fn(async (id: string) => (id === doc.id ? doc : null)),
    getDocuments: vi.fn(async () => [doc]),
    search: vi.fn(async () => [
      { chunkId: 7, docId: doc.id, law: doc.law, article: doc.article, title: doc.title, content: `header\n${doc.content}`, score: 0.032, similarity: 0.86, vectorRank: 1, textRank: 2 },
    ]),
    listEvalRuns: vi.fn(async () => [run]),
    getEvalRun: vi.fn(async (id: string) => (id === run.id ? run : null)),
    listEvalResults: vi.fn(async () => []),
    metrics: vi.fn(async (from: Date, to: Date) => ({
      from,
      to,
      totals: { requests: 3, refusals: 1, totalCostEur: 0.01, avgLatencyMs: 800, inputTokens: 300, outputTokens: 90, cacheReadTokens: 700, cacheWriteTokens: 0, cacheHitRate: 0.7 },
      byDay: [{ day: "2026-10-08", requests: 3, costEur: 0.01, p50LatencyMs: 700, p95LatencyMs: 1200, inputTokens: 300, outputTokens: 90, cacheReadTokens: 700, cacheWriteTokens: 0 }],
    })),
    ...overrides,
  };
}

interface GqlResult {
  data?: Record<string, unknown> | null;
  errors?: { message: string; extensions?: Record<string, unknown> }[];
}

/** Executes through Yoga's own fetch handler, exactly like the Next.js route does. */
async function exec(source: string, context: GraphQLContext, variables?: Record<string, unknown>): Promise<GqlResult> {
  const yoga = buildYoga(() => context);
  const response = await yoga.fetch("http://localhost/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: source, variables }),
  });
  return (await response.json()) as GqlResult;
}

describe("GraphQL resolvers (mocked repository)", () => {
  it("lists conversations with ISO dates", async () => {
    const repo = fakeRepo();
    const result = await exec("{ conversations { id title messageCount updatedAt } }", { repo, startEval: vi.fn() });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ conversations: [{ id: "c1", title: "Travaux", messageCount: 2, updatedAt: "2026-10-08T12:00:00.000Z" }] });
  });

  it("resolves a conversation's messages and cited documents", async () => {
    const result = await exec("{ conversation(id: \"c1\") { messages { content cacheReadTokens citations { n document { id article } } } } }", { repo: fakeRepo(), startEval: vi.fn() });
    expect(result.errors).toBeUndefined();
    expect(result.data?.conversation).toEqual({
      messages: [{ content: "Majorité de l'article 25 [1].", cacheReadTokens: 700, citations: [{ n: 1, document: { id: "65-557:25", article: "Article 25" } }] }],
    });
  });

  it("returns null for an unknown conversation or document", async () => {
    const result = await exec('{ conversation(id: "nope") { id } document(id: "x") { id } }', { repo: fakeRepo(), startEval: vi.fn() });
    expect(result.data).toEqual({ conversation: null, document: null });
  });

  it("filters documents by law and exposes search hits with excerpts", async () => {
    const repo = fakeRepo();
    const result = await exec('{ documents(law: "65-557") { id } search(query: "majorité travaux", k: 3) { chunkId vectorRank excerpt document { id } } }', { repo, startEval: vi.fn() });
    expect(result.errors).toBeUndefined();
    expect(repo.listDocuments).toHaveBeenCalledWith("65-557");
    expect(repo.search).toHaveBeenCalledWith("majorité travaux", 3);
    expect(result.data?.search).toEqual([{ chunkId: 7, vectorRank: 1, excerpt: doc.content, document: { id: doc.id } }]);
  });

  it("paginates conversations and bounds the page size", async () => {
    const repo = fakeRepo();
    const ok = await exec("{ conversations(limit: 10, offset: 20) { id } }", { repo, startEval: vi.fn() });
    expect(ok.errors).toBeUndefined();
    expect(repo.listConversations).toHaveBeenCalledWith({ limit: 10, offset: 20 });
    const tooBig = await exec("{ evalRuns(limit: 500) { id } }", { repo, startEval: vi.fn() });
    expect(tooBig.errors?.[0].message).toBe("limit must be between 1 and 100");
    const messages = await exec('{ conversation(id: "c1") { messages(limit: 1, offset: 1) { id } } }', { repo, startEval: vi.fn() });
    expect(messages.data).toEqual({ conversation: { messages: [] } });
  });

  it("maps eval guard refusals to typed GraphQL errors", async () => {
    const startEval = vi.fn(async () => {
      throw new EvalGuardError("CONFLICT", "Une évaluation est déjà en cours ; attendez qu'elle se termine.");
    });
    const result = await exec("mutation { runEval }", { repo: fakeRepo(), startEval });
    expect(result.errors?.[0].extensions?.code).toBe("CONFLICT");
    expect(result.errors?.[0].message).toContain("déjà en cours");
  });

  it("validates search arguments", async () => {
    const result = await exec('{ search(query: "x", k: 50) { chunkId } }', { repo: fakeRepo(), startEval: vi.fn() });
    expect(result.errors?.[0].message).toBe("k must be between 1 and 20");
    expect(result.errors?.[0].extensions?.code).toBe("BAD_USER_INPUT");
  });

  it("computes metrics over a default 31-day window and flattens totals", async () => {
    const repo = fakeRepo();
    const result = await exec("{ metrics { requests cacheHitRate totalCostEur costByDay { day p95LatencyMs } } }", { repo, startEval: vi.fn() });
    expect(result.errors).toBeUndefined();
    expect(result.data?.metrics).toEqual({ requests: 3, cacheHitRate: 0.7, totalCostEur: 0.01, costByDay: [{ day: "2026-10-08", p95LatencyMs: 1200 }] });
    const [from, to] = vi.mocked(repo.metrics).mock.calls[0];
    expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(31);
  });

  it("rejects an inverted metrics range", async () => {
    const result = await exec('{ metrics(from: "2026-10-09", to: "2026-10-01") { requests } }', { repo: fakeRepo(), startEval: vi.fn() });
    expect(result.errors?.[0].message).toBe("from must be before to");
  });

  it("exposes eval runs with their metrics", async () => {
    const result = await exec("{ evalRuns { id status metrics { recallAt8 judgeScore } } }", { repo: fakeRepo(), startEval: vi.fn() });
    expect(result.data?.evalRuns).toEqual([{ id: run.id, status: "done", metrics: { recallAt8: 0.93, judgeScore: 3.8 } }]);
  });

  it("creates and deletes conversations, and starts eval runs asynchronously", async () => {
    const repo = fakeRepo();
    const startEval = vi.fn(async () => "run-42");
    const result = await exec('mutation { createConversation(title: "  ") { id title } deleteConversation(id: "c1") runEval(name: "nightly") }', { repo, startEval });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ createConversation: { id: "c2", title: "Nouvelle conversation" }, deleteConversation: true, runEval: "run-42" });
    expect(startEval).toHaveBeenCalledWith("nightly");
  });
});
