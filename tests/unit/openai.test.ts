import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { priceFor } from "@/lib/cost";
import { OUT_OF_CORPUS_SENTINEL } from "@/lib/gate";
import { OpenAiJudge, OpenAiProvider, supportsReasoningEffort } from "@/lib/llm/openai";
import type { LlmEvent } from "@/lib/llm/types";
import { SYSTEM_PROMPT, type Extract } from "@/lib/prompts";

const extracts: Extract[] = [
  { n: 1, law: "Loi n° 65-557 du 10 juillet 1965", article: "Article 25", title: "Majorité absolue", content: "Texte de l'article 25.", docId: "65-557:25", chunkId: 1 } as Extract,
];

async function collect(iter: AsyncIterable<LlmEvent>): Promise<LlmEvent[]> {
  const out: LlmEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

function fakeStreamClient(chunks: string[], opts: { finish?: string; refusal?: string; model?: string } = {}) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    chat: {
      completions: {
        create: async (body: Record<string, unknown>) => {
          calls.push(body);
          return {
            async *[Symbol.asyncIterator]() {
              for (const text of chunks) yield { model: opts.model ?? "gpt-5-2025-08-07", choices: [{ delta: { content: text }, finish_reason: null }] };
              yield { model: opts.model ?? "gpt-5-2025-08-07", choices: [{ delta: { refusal: opts.refusal ?? null }, finish_reason: opts.finish ?? "stop" }] };
              yield { model: opts.model ?? "gpt-5-2025-08-07", choices: [], usage: { prompt_tokens: 2400, completion_tokens: 180, prompt_tokens_details: { cached_tokens: 1024 } } };
            },
          };
        },
      },
    },
  };
  return { client: client as unknown as OpenAI, calls };
}

describe("OpenAiProvider (fake client)", () => {
  it("sends system prompt first, history, reasoning effort and usage options, and maps usage", async () => {
    const { client, calls } = fakeStreamClient(["La majorité ", "de l'article 25 [1]."]);
    const provider = new OpenAiProvider({ model: "gpt-5", maxTokens: 16000, effort: "low", client });
    const events = await collect(provider.stream({ question: "Quelle majorité ?", extracts, history: [{ role: "user", content: "Bonjour" }, { role: "assistant", content: "Bonjour !" }] }));

    const body = calls[0];
    expect(body.model).toBe("gpt-5");
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.max_completion_tokens).toBe(16000);
    expect(body.reasoning_effort).toBe("low");
    const messages = body.messages as { role: string; content: string }[];
    expect(messages).toHaveLength(4);
    expect(messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(messages[3].content).toContain("Question : Quelle majorité ?");

    expect(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("")).toBe("La majorité de l'article 25 [1].");
    expect(events.at(-1)).toEqual({
      type: "usage",
      model: "gpt-5-2025-08-07",
      usage: { inputTokens: 1376, outputTokens: 180, cacheReadTokens: 1024, cacheWriteTokens: 0 },
    });
  });

  it("omits reasoning_effort for non-reasoning models", async () => {
    const { client, calls } = fakeStreamClient(["ok"], { model: "gpt-4.1" });
    await collect(new OpenAiProvider({ model: "gpt-4.1", maxTokens: 100, effort: "low", client }).stream({ question: "q", extracts, history: [] }));
    expect(calls[0]).not.toHaveProperty("reasoning_effort");
  });

  it("turns a content filter or refusal into the out-of-corpus sentinel", async () => {
    for (const opts of [{ finish: "content_filter" }, { refusal: "Je ne peux pas répondre." }]) {
      const { client } = fakeStreamClient([], opts);
      const events = await collect(new OpenAiProvider({ model: "gpt-5", maxTokens: 100, effort: "low", client }).stream({ question: "q", extracts, history: [] }));
      expect(events.some((e) => e.type === "text" && e.text.includes(OUT_OF_CORPUS_SENTINEL))).toBe(true);
    }
  });

  it("judges with JSON output and records a refusal as 'not judged'", async () => {
    const reply = (content: string | null, refusal: string | null = null) =>
      ({
        chat: {
          completions: {
            create: async () => ({
              model: "gpt-5-mini",
              choices: [{ message: { content, refusal }, finish_reason: "stop" }],
              usage: { prompt_tokens: 900, completion_tokens: 40, prompt_tokens_details: { cached_tokens: 0 } },
            }),
          },
        },
      }) as unknown as OpenAI;
    const input = { question: "q", referenceAnswer: "r", answer: "a", extracts, expectRefusal: false, refused: false };
    const ok = await new OpenAiJudge("gpt-5-mini", reply('{"score": 4, "rationale": "Exact."}')).judge(input);
    expect(ok).toMatchObject({ score: 4, rationale: "Exact.", model: "gpt-5-mini", usage: { inputTokens: 900, outputTokens: 40 } });
    const refused = await new OpenAiJudge("gpt-5-mini", reply(null, "non")).judge(input);
    expect(refused.score).toBeNull();
  });

  it("detects reasoning models and prices dated OpenAI ids like their base model", () => {
    expect(supportsReasoningEffort("gpt-5-mini")).toBe(true);
    expect(supportsReasoningEffort("o4-mini")).toBe(true);
    expect(supportsReasoningEffort("gpt-4o")).toBe(false);
    expect(priceFor("gpt-5-2025-08-07")).toEqual(priceFor("gpt-5"));
    expect(priceFor("mock-gpt-5")).toEqual(priceFor("gpt-5"));
  });
});
