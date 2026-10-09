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

export type LlmProviderName = "mock" | "openai" | "anthropic";
export const PROVIDERS: readonly LlmProviderName[] = ["mock", "openai", "anthropic"];
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export const env = {
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "postgres://coproguide:coproguide@localhost:5438/coproguide";
  },
  get llmProvider(): LlmProviderName {
    const value = (process.env.LLM_PROVIDER ?? "mock").toLowerCase();
    if (!PROVIDERS.includes(value as LlmProviderName)) throw new Error(`Unknown LLM_PROVIDER: ${value}`);
    return value as LlmProviderName;
  },
  /** True for every provider that costs money (everything but the mock). */
  get isPaidProvider() {
    return this.llmProvider !== "mock";
  },
  /** Generation model of the active provider (OPENAI_MODEL / ANTHROPIC_MODEL). */
  get generationModel() {
    if (this.llmProvider === "anthropic") return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
    return process.env.OPENAI_MODEL ?? "gpt-5";
  },
  /** LLM-as-judge model of the active provider (OPENAI_JUDGE_MODEL / ANTHROPIC_JUDGE_MODEL). */
  get judgeModel() {
    if (this.llmProvider === "anthropic") return process.env.ANTHROPIC_JUDGE_MODEL ?? "claude-haiku-5-5";
    return process.env.OPENAI_JUDGE_MODEL ?? "gpt-5-mini";
  },
  /** Reasoning effort for generation (OPENAI_REASONING_EFFORT / ANTHROPIC_EFFORT). */
  get generationEffort(): Effort {
    const raw = this.llmProvider === "anthropic" ? process.env.ANTHROPIC_EFFORT : process.env.OPENAI_REASONING_EFFORT;
    return (raw as Effort | undefined) ?? "low";
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
  /** Required (x-admin-token header) to start evaluations through the API with a paid provider. */
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
