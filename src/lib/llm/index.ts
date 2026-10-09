import { env, type LlmProviderName } from "../env";
import { AnthropicJudge, AnthropicProvider } from "./anthropic";
import { MockJudge, MockProvider } from "./mock";
import { OpenAiJudge, OpenAiProvider } from "./openai";
import type { Judge, LlmProvider } from "./types";

export * from "./types";

export function createProvider(name: LlmProviderName = env.llmProvider): LlmProvider {
  if (name === "openai") {
    return new OpenAiProvider({ model: env.generationModel, maxTokens: env.maxTokens, effort: env.generationEffort });
  }
  if (name === "anthropic") {
    return new AnthropicProvider({
      model: env.generationModel,
      maxTokens: env.maxTokens,
      effort: env.generationEffort,
      serverSideFallback: env.serverSideFallback,
    });
  }
  return new MockProvider(env.generationModel, env.mockStreamDelayMs);
}

export function createJudge(name: LlmProviderName = env.llmProvider): Judge {
  if (name === "openai") return new OpenAiJudge(env.judgeModel);
  return name === "anthropic" ? new AnthropicJudge(env.judgeModel) : new MockJudge();
}

let shared: LlmProvider | null = null;
/** Process-wide provider (keeps the mock's simulated cache state between requests). */
export function getProvider(): LlmProvider {
  shared ??= createProvider();
  return shared;
}
