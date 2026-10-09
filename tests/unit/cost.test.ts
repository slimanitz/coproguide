import { describe, expect, it } from "vitest";
import { addUsage, cacheHitRate, costEur, costUsd, priceFor, PRICES_USD_PER_MTOK } from "@/lib/cost";

describe("cost", () => {
  it("prices Sonnet 5.5 input, output, cache read and cache write tokens", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 };
    // 2 + 10 + 0.20 + 2.50 USD
    expect(costUsd(usage, "claude-sonnet-5-5")).toBeCloseTo(14.7);
    expect(costEur(usage, "claude-sonnet-5-5", 0.5)).toBeCloseTo(7.35);
  });

  it("prices a realistic RAG call with a cached system prompt", () => {
    const usage = { inputTokens: 2600, outputTokens: 300, cacheReadTokens: 700, cacheWriteTokens: 0 };
    expect(costUsd(usage, "claude-haiku-4-5")).toBeCloseTo((2600 * 1 + 300 * 5 + 700 * 0.1) / 1e6, 10);
  });

  it("prices the Haiku 5.5 judge", () => {
    const usage = { inputTokens: 3000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 };
    expect(costUsd(usage, "claude-haiku-5-5")).toBeCloseTo((3000 * 0.1 + 200 * 0.5) / 1e6, 12);
  });

  it("prices mock models like their base model and unknown models at zero", () => {
    expect(priceFor("mock-claude-sonnet-5-5")).toEqual(PRICES_USD_PER_MTOK["claude-sonnet-5-5"]);
    expect(costUsd({ inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 }, "gpt-unknown")).toBe(0);
  });

  it("Claude: cache write 1.25x input, cache read 0.1x (or less); OpenAI: no write cost, cached input at most 0.5x", () => {
    for (const [model, p] of Object.entries(PRICES_USD_PER_MTOK)) {
      if (model.startsWith("claude-")) {
        expect(p.cacheWrite, model).toBeCloseTo(p.input * 1.25);
        expect(p.cacheRead, model).toBeLessThanOrEqual(p.input * 0.1 + 1e-9);
      } else {
        expect(p.cacheWrite, model).toBe(0);
        expect(p.cacheRead, model).toBeLessThanOrEqual(p.input * 0.5 + 1e-9);
      }
    }
  });

  it("computes the cache hit rate over all prompt tokens", () => {
    expect(cacheHitRate({ inputTokens: 300, outputTokens: 50, cacheReadTokens: 700, cacheWriteTokens: 0 })).toBeCloseTo(0.7);
    expect(cacheHitRate({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(0);
    expect(addUsage({ inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 }, { inputTokens: 1, outputTokens: 1, cacheReadTokens: 1, cacheWriteTokens: 1 })).toEqual({
      inputTokens: 2,
      outputTokens: 3,
      cacheReadTokens: 4,
      cacheWriteTokens: 5,
    });
  });
});
