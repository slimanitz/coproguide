import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { streamGeneration, type ChatEvent, type GenerationResult } from "@/lib/chat";
import { OUT_OF_CORPUS_SENTINEL, REFUSAL_MESSAGE } from "@/lib/gate";
import { AnthropicProvider } from "@/lib/llm/anthropic";
import type { LlmEvent, LlmProvider } from "@/lib/llm/types";

function fakeProvider(chunks: string[]): LlmProvider {
  return {
    name: "mock",
    model: "fake",
    async *stream(): AsyncIterable<LlmEvent> {
      for (const text of chunks) yield { type: "text", text };
      yield { type: "usage", model: "fake", usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    },
  };
}

async function run(provider: LlmProvider): Promise<{ events: ChatEvent[]; result: GenerationResult }> {
  const events: ChatEvent[] = [];
  const generator = streamGeneration(provider, { question: "q", extracts: [], history: [] });
  let step = await generator.next();
  while (!step.done) {
    events.push(step.value);
    step = await generator.next();
  }
  return { events, result: step.value };
}

const visible = (events: ChatEvent[]) => events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("");

describe("streamGeneration", () => {
  it("forwards a normal answer untouched", async () => {
    const { events, result } = await run(fakeProvider(["La majorité ", "de l'article 25 [1]."]));
    expect(visible(events)).toBe("La majorité de l'article 25 [1].");
    expect(events.some((e) => e.type === "refused")).toBe(false);
    expect(result).toMatchObject({ refused: false, text: "La majorité de l'article 25 [1].", model: "fake" });
  });

  it("emits a refused event as soon as a mid-answer sentinel appears and never leaks it", async () => {
    const { events, result } = await run(fakeProvider(["Début de réponse. ", "[HORS_", "CORPUS]", " suite ignorée"]));
    const refusedIndex = events.findIndex((e) => e.type === "refused");
    expect(refusedIndex).toBeGreaterThan(-1);
    expect(events[refusedIndex]).toEqual({ type: "refused", reason: "llm_out_of_corpus", message: REFUSAL_MESSAGE });
    expect(visible(events)).toBe("Début de réponse. ");
    expect(events.slice(refusedIndex).some((e) => e.type === "text")).toBe(false);
    expect(JSON.stringify(events)).not.toContain(OUT_OF_CORPUS_SENTINEL);
    expect(result.refused).toBe(true);
  });

  it("turns an Anthropic safety refusal (stop_reason=refusal) into a refused event without leaking the sentinel", async () => {
    const client = {
      beta: {
        messages: {
          stream: () => ({
            async *[Symbol.asyncIterator]() {
              yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Réponse partielle" } };
            },
            finalMessage: async () => ({
              model: "claude-sonnet-5-5",
              stop_reason: "refusal",
              usage: { input_tokens: 100, output_tokens: 3, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
            }),
          }),
        },
      },
    } as unknown as Anthropic;
    const provider = new AnthropicProvider({ model: "claude-sonnet-5-5", maxTokens: 1000, effort: "low", serverSideFallback: true, client });
    const { events, result } = await run(provider);
    expect(events.map((e) => e.type)).toEqual(["text", "refused"]);
    expect(JSON.stringify(events)).not.toContain(OUT_OF_CORPUS_SENTINEL);
    expect(result.refused).toBe(true);
    expect(result.usage.inputTokens).toBe(100);
  });
});
