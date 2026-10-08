/**
 * Claude price table, USD per million tokens (Anthropic first-party API rates, from the
 * claude-api skill, cached 2026-10-06). Cache writes use the 5-minute TTL multiplier (1.25x input);
 * cache reads 0.1x input unless the skill lists a specific rate. Haiku 5.5 prices are for prompts
 * up to 100K tokens (every CoproGuide prompt is far below that).
 * Costs are stored in euros using USD_TO_EUR.
 */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const PRICES_USD_PER_MTOK: Record<string, ModelPrice> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** "mock-claude-sonnet-5-5" is priced like "claude-sonnet-5-5" so the offline demo shows realistic estimates. */
export function priceFor(model: string): ModelPrice | null {
  const base = model.replace(/^mock-/, "");
  return PRICES_USD_PER_MTOK[base] ?? null;
}

export function costUsd(usage: TokenUsage, model: string): number {
  const price = priceFor(model);
  if (!price) return 0;
  return (
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * price.cacheRead +
      usage.cacheWriteTokens * price.cacheWrite) /
    1_000_000
  );
}

export function costEur(usage: TokenUsage, model: string, usdToEur: number): number {
  return costUsd(usage, model) * usdToEur;
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

/** Share of prompt tokens served from cache: cache_read / (uncached input + cache_read + cache_write). */
export function cacheHitRate(usage: TokenUsage): number {
  const prompt = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  return prompt === 0 ? 0 : usage.cacheReadTokens / prompt;
}
