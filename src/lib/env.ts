/**
 * Centralised, typed access to environment variables with sensible defaults.
 * Every variable is documented in .env.example.
 */
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (Number.isNaN(value)) throw new Error(`Invalid number for ${name}: ${raw}`);
  return value;
}

export type LlmProviderName = "mock" | "anthropic";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export const env = {
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "postgres://coproguide:coproguide@localhost:5438/coproguide";
  },
  get llmProvider(): LlmProviderName {
    const value = (process.env.LLM_PROVIDER ?? "mock").toLowerCase();
    if (value !== "mock" && value !== "anthropic") throw new Error(`Unknown LLM_PROVIDER: ${value}`);
    return value;
  },
  get generationModel() {
    return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
  },
  get judgeModel() {
    return process.env.ANTHROPIC_JUDGE_MODEL ?? "claude-haiku-5-5";
  },
  get generationEffort(): Effort {
    return (process.env.ANTHROPIC_EFFORT as Effort | undefined) ?? "low";
  },
  get maxTokens() {
    return num("LLM_MAX_TOKENS", 16000);
  },
  get serverSideFallback() {
    return (process.env.ANTHROPIC_FALLBACKS ?? "default") !== "off";
  },
  get minSimilarity() {
    return num("RAG_MIN_SIMILARITY", 0.83);
  },
  /** Previous question/answer exchanges sent to the model as conversation history. */
  get chatHistoryTurns() {
    return num("CHAT_HISTORY_TURNS", 10);
  },
  /** Required (x-admin-token header) to start evaluations through the API when LLM_PROVIDER=anthropic. */
  get adminToken() {
    return process.env.ADMIN_TOKEN || undefined;
  },
  /** Maximum evaluation runs started through the API per hour (per server process). */
  get evalRateLimit() {
    return num("EVAL_RATE_LIMIT_PER_HOUR", 3);
  },
  get topK() {
    return num("RAG_TOP_K", 8);
  },
  get usdToEur() {
    return num("USD_TO_EUR", 0.86);
  },
  get mockStreamDelayMs() {
    return num("MOCK_STREAM_DELAY_MS", 15);
  },
  get embeddingModel() {
    return process.env.EMBEDDING_MODEL ?? "Xenova/multilingual-e5-small";
  },
  get embeddingDtype(): "fp32" | "q8" {
    return (process.env.EMBEDDING_DTYPE as "fp32" | "q8" | undefined) ?? "q8";
  },
  get modelCacheDir() {
    return process.env.MODEL_CACHE_DIR ?? ".cache/models";
  },
  get chunkMaxTokens() {
    return num("CHUNK_MAX_TOKENS", 450);
  },
  get chunkOverlapTokens() {
    return num("CHUNK_OVERLAP_TOKENS", 100);
  },
};
