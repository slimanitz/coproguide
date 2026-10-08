import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { chat, type ChatEvent } from "@/lib/chat";
import { closeDb, getDb, type Db } from "@/lib/db/client";
import { citations, conversations, documents, messages } from "@/lib/db/schema";
import { ingestCorpus } from "@/lib/ingest";
import { MockProvider } from "@/lib/llm/mock";
import { createRepository } from "@/lib/repo";
import { hybridSearch } from "@/lib/retrieval";

const url = inject("testDatabaseUrl");

describe.skipIf(!url)("RAG pipeline against PostgreSQL + pgvector", () => {
  let db: Db;

  beforeAll(async () => {
    db = getDb(url!);
    await db.execute(sql`TRUNCATE documents, chunks, conversations, messages, citations, eval_runs, eval_results CASCADE`);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("ingests the 5-article fixture idempotently", async () => {
    const first = await ingestCorpus(db, "tests/fixtures/corpus", { prune: true });
    expect(first).toMatchObject({ articles: 5, inserted: 5, updated: 0, unchanged: 0 });
    expect(first.chunks).toBeGreaterThanOrEqual(5);

    const second = await ingestCorpus(db, "tests/fixtures/corpus", { prune: true });
    expect(second).toMatchObject({ inserted: 0, updated: 0, unchanged: 5, chunks: 0 });

    const [{ count }] = (await db.execute(sql`SELECT count(*)::int AS count FROM chunks WHERE embedding IS NOT NULL AND content_tsv IS NOT NULL`)) as unknown as { count: number }[];
    expect(count).toBe(first.chunks);
  });

  it.each([
    ["Quel est le délai de convocation d'une assemblée générale de copropriété ?", "67-223:9"],
    ["Quel est le montant maximum du dépôt de garantie pour une location vide ?", "89-462:22"],
    ["Quelle majorité pour supprimer le poste de gardien de l'immeuble ?", "65-557:26"],
  ])("hybrid search ranks the expected article first: %s", async (question, expected) => {
    const result = await hybridSearch(db, question, 8);
    expect(result.hits[0].docId).toBe(expected);
    expect(result.bestSimilarity).toBeGreaterThan(0.8);
    // Hits are fused from both retrievers and carry their ranks.
    expect(result.hits.some((h) => h.vectorRank !== null && h.textRank !== null)).toBe(true);
  });

  it("chats with the mock provider: streams text, cites art. 25, persists the turn", async () => {
    const events: ChatEvent[] = [];
    const generator = chat(
      { db, provider: new MockProvider("claude-sonnet-5-5"), minSimilarity: 0.8 },
      { question: "Quelle majorité pour voter des travaux d'amélioration ?" },
    );
    for await (const event of generator) events.push(event);

    const types = events.map((e) => e.type);
    expect(types[0]).toBe("meta");
    expect(types.slice(-3)).toEqual(["citations", "usage", "done"]);
    const text = events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("");
    expect(text).toContain("Article 25");

    const cited = events.find((e) => e.type === "citations");
    expect(cited?.type === "citations" && cited.citations.map((c) => c.docId)).toContain("65-557:25");

    const done = events.at(-1);
    expect(done).toMatchObject({ type: "done", refused: false });
    const meta = events[0];
    const conversationId = meta.type === "meta" ? meta.conversationId : null;
    expect(conversationId).toBeTruthy();

    const stored = await db.select().from(messages).where(eq(messages.conversationId, conversationId!));
    expect(stored.map((m) => m.role).sort()).toEqual(["assistant", "user"]);
    const assistant = stored.find((m) => m.role === "assistant")!;
    expect(assistant.costEur).toBeGreaterThan(0);
    expect(assistant.inputTokens).toBeGreaterThan(0);
    const storedCitations = await db.select().from(citations).where(eq(citations.messageId, assistant.id));
    expect(storedCitations.map((c) => c.docId)).toContain("65-557:25");

    const repo = createRepository(db);
    const conversation = await repo.getConversation(conversationId!);
    expect(conversation?.messages).toHaveLength(2);
    const metrics = await repo.metrics(new Date(Date.now() - 86_400_000), new Date(Date.now() + 86_400_000));
    expect(metrics.totals.requests).toBeGreaterThanOrEqual(1);
  });

  it("refuses out-of-corpus questions without calling the LLM", async () => {
    const events: ChatEvent[] = [];
    for await (const e of chat({ db, provider: new MockProvider("claude-sonnet-5-5"), minSimilarity: 0.83 }, { question: "Quelle est la recette de la blanquette de veau ?" })) {
      events.push(e);
    }
    expect(events.at(-1)).toMatchObject({ type: "done", refused: true, reason: "low_similarity" });
    const usage = events.find((e) => e.type === "usage");
    expect(usage).toMatchObject({ model: "none", costEur: 0 });
  });

  it("deletes a conversation with its messages (cascade)", async () => {
    const [c] = await db.select().from(conversations).limit(1);
    await createRepository(db).deleteConversation(c.id);
    expect(await db.select().from(messages).where(eq(messages.conversationId, c.id))).toHaveLength(0);
    expect((await db.select().from(documents)).length).toBe(5);
  });
});
