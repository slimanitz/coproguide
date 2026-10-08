import { desc, eq } from "drizzle-orm";
import { resolveCitations, type Citation } from "./citations";
import { costEur, ZERO_USAGE, type TokenUsage } from "./cost";
import type { Db } from "./db/client";
import { citations as citationsTable, conversations, messages } from "./db/schema";
import { env } from "./env";
import { REFUSAL_MESSAGE, retrievalGate, type RefusalReason } from "./gate";
import type { ChatTurn, LlmProvider } from "./llm/types";
import type { Extract } from "./prompts";
import { hybridSearch } from "./retrieval";
import { SentinelFilter } from "./sentinel-filter";

export type ChatEvent =
  | { type: "meta"; conversationId: string | null; extracts: number; bestSimilarity: number | null }
  | { type: "text"; text: string }
  /** Sent as soon as the answer is known to be a refusal: the UI replaces any partial text with `message`. */
  | { type: "refused"; reason: RefusalReason; message: string }
  | { type: "citations"; citations: Citation[] }
  | { type: "usage"; usage: TokenUsage; model: string; costEur: number; latencyMs: number }
  | { type: "done"; refused: boolean; reason: RefusalReason | null; messageId: string | null };

export interface AnswerResult {
  answer: string;
  refused: boolean;
  reason: RefusalReason | null;
  extracts: Extract[];
  citations: Citation[];
  usage: TokenUsage;
  model: string;
  costEur: number;
  latencyMs: number;
  bestSimilarity: number | null;
}

export interface AnswerDeps {
  db: Db;
  provider: LlmProvider;
  minSimilarity?: number;
  topK?: number;
  usdToEur?: number;
}

/**
 * Core RAG flow, persistence-free: hybrid retrieval → confidence gate → streamed generation
 * → citation resolution → usage and cost. Yields UI events and returns the final result.
 */
export async function* answerQuestion(
  deps: AnswerDeps,
  input: { question: string; history?: ChatTurn[]; signal?: AbortSignal },
): AsyncGenerator<ChatEvent, AnswerResult> {
  const started = performance.now();
  const minSimilarity = deps.minSimilarity ?? env.minSimilarity;
  const usdToEur = deps.usdToEur ?? env.usdToEur;

  const search = await hybridSearch(deps.db, input.question, deps.topK ?? env.topK);
  const extracts: Extract[] = search.hits.map((hit, i) => ({
    n: i + 1,
    docId: hit.docId,
    chunkId: hit.chunkId,
    law: hit.law,
    article: hit.article,
    title: hit.title,
    content: hit.content,
    score: hit.score,
    similarity: hit.similarity,
  }));

  yield { type: "meta", conversationId: null, extracts: extracts.length, bestSimilarity: search.bestSimilarity };

  const gate = retrievalGate(search.bestSimilarity, minSimilarity);
  if (!gate.pass) {
    yield { type: "refused", reason: gate.reason ?? "low_similarity", message: REFUSAL_MESSAGE };
    yield { type: "citations", citations: [] };
    const latencyMs = Math.round(performance.now() - started);
    yield { type: "usage", usage: ZERO_USAGE, model: "none", costEur: 0, latencyMs };
    return {
      answer: REFUSAL_MESSAGE,
      refused: true,
      reason: gate.reason ?? "low_similarity",
      extracts,
      citations: [],
      usage: ZERO_USAGE,
      model: "none",
      costEur: 0,
      latencyMs,
      bestSimilarity: search.bestSimilarity,
    };
  }

  const generation = yield* streamGeneration(deps.provider, { question: input.question, extracts, history: input.history ?? [], signal: input.signal });
  const { refused, usage, model } = generation;
  const answer = refused ? REFUSAL_MESSAGE : generation.text;
  const cited = refused ? [] : resolveCitations(answer, extracts);
  yield { type: "citations", citations: cited };

  const latencyMs = Math.round(performance.now() - started);
  const cost = costEur(usage, model, usdToEur);
  yield { type: "usage", usage, model, costEur: cost, latencyMs };

  return {
    answer,
    refused,
    reason: refused ? "llm_out_of_corpus" : null,
    extracts,
    citations: cited,
    usage,
    model,
    costEur: cost,
    latencyMs,
    bestSimilarity: search.bestSimilarity,
  };
}

export interface GenerationResult {
  text: string;
  refused: boolean;
  usage: TokenUsage;
  model: string;
}

/**
 * Streams one generation: forwards text with the out-of-corpus sentinel filtered out, and emits
 * a `refused` event the moment the sentinel appears (even mid-answer or after a safety refusal),
 * after which further text is discarded.
 */
export async function* streamGeneration(
  provider: LlmProvider,
  params: { question: string; extracts: Extract[]; history: ChatTurn[]; signal?: AbortSignal },
): AsyncGenerator<ChatEvent, GenerationResult> {
  const filter = new SentinelFilter();
  let usage: TokenUsage = ZERO_USAGE;
  let model = provider.model;
  let refusedSent = false;
  for await (const event of provider.stream(params)) {
    if (params.signal?.aborted) break;
    if (event.type === "usage") {
      usage = event.usage;
      model = event.model;
      continue;
    }
    const forward = filter.push(event.text);
    if (filter.isOutOfCorpus) {
      if (!refusedSent) {
        refusedSent = true;
        yield { type: "refused", reason: "llm_out_of_corpus", message: REFUSAL_MESSAGE };
      }
    } else if (forward) {
      yield { type: "text", text: forward };
    }
  }
  const tail = filter.flush();
  if (tail && !filter.isOutOfCorpus) yield { type: "text", text: tail };
  return { text: filter.visibleText, refused: filter.isOutOfCorpus, usage, model };
}

/** Number of previous question/answer exchanges sent to the model as history. */
function historyExchanges(): number {
  return env.chatHistoryTurns;
}

/** Persists one assistant answer (and its citations) to the ledger. */
export async function saveAssistantMessage(
  db: Db,
  result: AnswerResult,
  options: { conversationId: string | null; origin: "chat" | "eval"; provider: string },
): Promise<string> {
  const [row] = await db
    .insert(messages)
    .values({
      conversationId: options.conversationId,
      origin: options.origin,
      role: "assistant",
      content: result.answer,
      refused: result.refused,
      refusalReason: result.reason,
      provider: options.provider,
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheWriteTokens: result.usage.cacheWriteTokens,
      latencyMs: result.latencyMs,
      costEur: result.costEur,
      bestSimilarity: result.bestSimilarity,
    })
    .returning({ id: messages.id });
  if (result.citations.length) {
    await db.insert(citationsTable).values(
      result.citations.map((c) => ({ messageId: row.id, n: c.n, docId: c.docId, chunkId: c.chunkId, score: c.score })),
    );
  }
  return row.id;
}

export function conversationTitle(question: string): string {
  const clean = question.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

/**
 * Chat with persistence: creates the conversation when needed, stores the user message,
 * streams the answer, then stores the assistant message, citations and usage.
 */
export async function* chat(
  deps: AnswerDeps,
  input: { question: string; conversationId?: string | null; signal?: AbortSignal },
): AsyncGenerator<ChatEvent, AnswerResult> {
  const { db } = deps;
  let conversationId = input.conversationId ?? null;
  if (conversationId) {
    const [existing] = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.id, conversationId));
    if (!existing) conversationId = null;
  }
  if (!conversationId) {
    const [created] = await db.insert(conversations).values({ title: conversationTitle(input.question) }).returning({ id: conversations.id });
    conversationId = created.id;
  }

  // Only the tail of the conversation is loaded and sent: history is capped at N exchanges.
  const previous = (
    await db
      .select({ role: messages.role, content: messages.content, refused: messages.refused })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(historyExchanges() * 2 + 2)
  ).reverse();
  // Refused turns are dropped from the context (they carry no grounded content).
  const history: ChatTurn[] = [];
  for (let i = 0; i < previous.length; i++) {
    const m = previous[i];
    const next = previous[i + 1];
    if (m.role === "user" && next?.role === "assistant" && !next.refused) {
      history.push({ role: "user", content: m.content }, { role: "assistant", content: next.content });
      i++;
    }
  }

  await db.insert(messages).values({ conversationId, role: "user", content: input.question, origin: "chat" });
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));

  const generator = answerQuestion(deps, { question: input.question, history: history.slice(-historyExchanges() * 2), signal: input.signal });
  let step = await generator.next();
  while (!step.done) {
    const event = step.value;
    yield event.type === "meta" ? { ...event, conversationId } : event;
    step = await generator.next();
  }
  const result = step.value;
  const messageId = await saveAssistantMessage(db, result, { conversationId, origin: "chat", provider: deps.provider.name });
  yield { type: "done", refused: result.refused, reason: result.reason, messageId };
  return result;
}
