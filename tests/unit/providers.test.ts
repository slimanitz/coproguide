import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { OUT_OF_CORPUS_SENTINEL } from "@/lib/gate";
import { AnthropicJudge, AnthropicProvider, parseJudgeOutput } from "@/lib/llm/anthropic";
import { MockJudge, MockProvider, mockAnswer } from "@/lib/llm/mock";
import type { LlmEvent } from "@/lib/llm/types";
import { SYSTEM_PROMPT, type Extract } from "@/lib/prompts";

const extracts: Extract[] = [
  {
    n: 1,
    docId: "65-557:24",
    chunkId: 1,
    law: "Loi n° 65-557 du 10 juillet 1965 fixant le statut de la copropriété des immeubles bâtis",
    article: "Article 24",
    title: "Majorité simple",
    content: "header\nLes décisions de l'assemblée générale sont prises à la majorité des voix exprimées.",
    score: 0.03,
    similarity: 0.84,
  },
  {
    n: 2,
    docId: "65-557:25",
    chunkId: 2,
    law: "Loi n° 65-557 du 10 juillet 1965 fixant le statut de la copropriété des immeubles bâtis",
    article: "Article 25",
    title: "Majorité absolue",
    content:
      "header\nNe sont adoptées qu'à la majorité des voix de tous les copropriétaires les décisions concernant :\n\nn) L'ensemble des travaux comportant transformation, addition ou amélioration.",
    score: 0.03,
    similarity: 0.85,
  },
];

async function collect(iterable: AsyncIterable<LlmEvent>) {
  const events: LlmEvent[] = [];
  for await (const e of iterable) events.push(e);
  return events;
}

describe("MockProvider", () => {
  it("quotes the most relevant article with its lead-in and a [n] citation", () => {
    const answer = mockAnswer("Quelle majorité pour voter des travaux d'amélioration ?", extracts);
    expect(answer).toContain("**Article 25 — Majorité absolue**");
    expect(answer).toContain("majorité des voix de tous les copropriétaires");
    expect(answer).toContain("[2]");
  });

  it("answers with the sentinel when no extract covers the question", () => {
    expect(mockAnswer("Recette de la blanquette de veau", extracts)).toBe(OUT_OF_CORPUS_SENTINEL);
    expect(mockAnswer("Quelle majorité ?", [])).toBe(OUT_OF_CORPUS_SENTINEL);
  });

  it("streams deterministic text then simulated usage (cache write first, read after)", async () => {
    const provider = new MockProvider("claude-sonnet-5-5");
    const params = { question: "Quelle majorité pour des travaux d'amélioration ?", extracts, history: [] };
    const first = await collect(provider.stream(params));
    const second = await collect(provider.stream(params));
    const text = (events: LlmEvent[]) => events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("");
    expect(text(first)).toBe(text(second));
    const usage = (events: LlmEvent[]) => events.find((e) => e.type === "usage");
    expect(usage(first)).toMatchObject({ model: "mock-claude-sonnet-5-5", usage: { cacheReadTokens: 0 } });
    expect(usage(second)).toMatchObject({ usage: { cacheWriteTokens: 0 } });
  });
});

describe("MockJudge", () => {
  it("scores refusals on out-of-corpus questions as correct", async () => {
    const judge = new MockJudge();
    const base = { question: "q", referenceAnswer: "r", answer: "a", extracts: [] };
    expect((await judge.judge({ ...base, expectRefusal: true, refused: true })).score).toBe(5);
    expect((await judge.judge({ ...base, expectRefusal: true, refused: false })).score).toBe(1);
    expect((await judge.judge({ ...base, expectRefusal: false, refused: true })).score).toBe(1);
  });

  it("rewards overlap with the reference answer", async () => {
    const judge = new MockJudge();
    const reference = "Majorité des voix de tous les copropriétaires, article 25, travaux d'amélioration.";
    const good = await judge.judge({ question: "q", referenceAnswer: reference, answer: reference, extracts: [], expectRefusal: false, refused: false });
    const bad = await judge.judge({ question: "q", referenceAnswer: reference, answer: "Le bail dure trois ans.", extracts: [], expectRefusal: false, refused: false });
    expect(good.score).toBe(5);
    expect(bad.score).toBeLessThan(3);
  });
});

describe("AnthropicProvider (fake client)", () => {
  function fakeClient(chunks: string[], stopReason = "end_turn") {
    const calls: unknown[] = [];
    const client = {
      beta: {
        messages: {
          stream(body: unknown) {
            calls.push(body);
            return {
              async *[Symbol.asyncIterator]() {
                for (const text of chunks) yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } };
              },
              finalMessage: async () => ({
                model: "claude-sonnet-5-5",
                stop_reason: stopReason,
                usage: { input_tokens: 2400, output_tokens: 180, cache_read_input_tokens: 720, cache_creation_input_tokens: 0 },
              }),
            };
          },
        },
      },
    };
    return { client: client as unknown as Anthropic, calls };
  }

  it("sends a cached system prompt, effort, fallbacks, and maps usage", async () => {
    const { client, calls } = fakeClient(["La majorité ", "de l'article 25 [2]."]);
    const provider = new AnthropicProvider({ model: "claude-sonnet-5-5", maxTokens: 16000, effort: "low", serverSideFallback: true, client });
    const events = await collect(provider.stream({ question: "Quelle majorité ?", extracts, history: [{ role: "user", content: "Bonjour" }, { role: "assistant", content: "Bonjour !" }] }));

    const body = calls[0] as Record<string, unknown>;
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.system).toEqual([{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]);
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(body.fallbacks).toBe("default");
    const messages = body.messages as { role: string; content: string }[];
    expect(messages).toHaveLength(3);
    expect(messages[2].content).toContain("[2] Loi n° 65-557");
    expect(messages[2].content).toContain("Question : Quelle majorité ?");

    expect(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("")).toBe("La majorité de l'article 25 [2].");
    expect(events.at(-1)).toEqual({
      type: "usage",
      model: "claude-sonnet-5-5",
      usage: { inputTokens: 2400, outputTokens: 180, cacheReadTokens: 720, cacheWriteTokens: 0 },
    });
  });

  it("turns a safety refusal into the out-of-corpus sentinel", async () => {
    const { client } = fakeClient([], "refusal");
    const provider = new AnthropicProvider({ model: "claude-sonnet-5-5", maxTokens: 1000, effort: "low", serverSideFallback: false, client });
    const events = await collect(provider.stream({ question: "q", extracts, history: [] }));
    expect(events.some((e) => e.type === "text" && e.text.includes(OUT_OF_CORPUS_SENTINEL))).toBe(true);
  });

  it("judges with low effort and records a refusal as 'not judged' instead of failing", async () => {
    const calls: Record<string, unknown>[] = [];
    const reply = (stop_reason: string, text: string) =>
      ({
        messages: {
          create: async (body: Record<string, unknown>) => {
            calls.push(body);
            return {
              model: "claude-haiku-5-5",
              stop_reason,
              content: [{ type: "thinking", thinking: "" }, { type: "text", text }],
              usage: { input_tokens: 900, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
            };
          },
        },
      }) as unknown as Anthropic;
    const input = { question: "q", referenceAnswer: "r", answer: "a", extracts, expectRefusal: false, refused: false };
    const ok = await new AnthropicJudge("claude-haiku-5-5", reply("end_turn", '{"score": 4, "rationale": "Exact."}')).judge(input);
    expect(ok).toMatchObject({ score: 4, model: "claude-haiku-5-5", usage: { inputTokens: 900 } });
    expect(calls[0]).toMatchObject({ model: "claude-haiku-5-5", output_config: { effort: "low" } });
    const refused = await new AnthropicJudge("claude-haiku-5-5", reply("refusal", "")).judge(input);
    expect(refused.score).toBeNull();
  });

  it("parses judge JSON even when wrapped in prose", () => {
    expect(parseJudgeOutput('Voici : {"score": 4, "rationale": "Exact."}')).toEqual({ score: 4, rationale: "Exact." });
    expect(() => parseJudgeOutput('{"score": 9}')).toThrow();
    expect(() => parseJudgeOutput("pas de json")).toThrow();
  });

  it("keeps the system prompt long enough to be cacheable on Sonnet 5.5 (>= 512 tokens)", () => {
    expect(SYSTEM_PROMPT.length / 4).toBeGreaterThan(512);
  });
});
