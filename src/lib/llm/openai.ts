import OpenAI from "openai";
import type { Effort } from "../env";
import { OUT_OF_CORPUS_SENTINEL } from "../gate";
import { buildUserTurn, formatExtracts, JUDGE_SYSTEM_PROMPT, SYSTEM_PROMPT } from "../prompts";
import { parseJudgeOutput } from "./judge-output";
import type { GenerateParams, Judge, JudgeInput, JudgeVerdict, LlmEvent, LlmProvider } from "./types";

export interface OpenAiProviderOptions {
  model: string;
  maxTokens: number;
  /** Reasoning effort, sent only to reasoning models (GPT-5 family, o-series). */
  effort: Effort;
  client?: OpenAI;
}

/** GPT-5 and o-series models accept `reasoning_effort`; older chat models reject it. */
export function supportsReasoningEffort(model: string): boolean {
  return /^(gpt-5|o\d)/.test(model);
}

function mapUsage(usage: OpenAI.CompletionUsage | null | undefined) {
  const prompt = usage?.prompt_tokens ?? 0;
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  // OpenAI counts cached tokens inside prompt_tokens; the dashboard expects uncached input
  // and cache reads separately (same semantics as the Claude provider). Automatic prompt
  // caching has no write cost, so cacheWriteTokens is always 0.
  return {
    inputTokens: Math.max(0, prompt - cached),
    outputTokens: usage?.completion_tokens ?? 0,
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
  };
}

/**
 * Generation with the OpenAI Chat Completions API, streamed. The system prompt is sent first so
 * that OpenAI's automatic prompt caching (prefix-based, prompts of 1 024+ tokens) can reuse it;
 * retrieved extracts and the question follow in the user turn. `OPENAI_BASE_URL` is honoured by
 * the SDK, so any OpenAI-compatible endpoint works too.
 */
export class OpenAiProvider implements LlmProvider {
  readonly name = "openai" as const;
  readonly model: string;
  private readonly client: OpenAI;

  constructor(private readonly options: OpenAiProviderOptions) {
    this.model = options.model;
    this.client = options.client ?? new OpenAI();
  }

  async *stream(params: GenerateParams): AsyncIterable<LlmEvent> {
    const stream = await this.client.chat.completions.create(
      {
        model: this.options.model,
        stream: true,
        stream_options: { include_usage: true },
        max_completion_tokens: this.options.maxTokens,
        ...(supportsReasoningEffort(this.options.model) ? { reasoning_effort: this.options.effort } : {}),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...params.history.map((turn) => ({ role: turn.role, content: turn.content })),
          { role: "user", content: buildUserTurn(params.question, params.extracts) },
        ],
      },
      { signal: params.signal },
    );

    let model = this.options.model;
    let usage: OpenAI.CompletionUsage | null | undefined;
    let refused = false;
    for await (const chunk of stream) {
      model = chunk.model || model;
      if (chunk.usage) usage = chunk.usage;
      const choice = chunk.choices[0];
      if (!choice) continue;
      if (choice.delta.content) yield { type: "text", text: choice.delta.content };
      if (choice.delta.refusal || choice.finish_reason === "content_filter") refused = true;
    }
    if (refused) {
      // A safety decline is surfaced as an out-of-corpus refusal rather than a partial answer.
      yield { type: "text", text: `\n${OUT_OF_CORPUS_SENTINEL}` };
    }
    yield { type: "usage", model, usage: mapUsage(usage) };
  }
}

/** LLM-as-judge with a small OpenAI model, non-streaming, JSON output. */
export class OpenAiJudge implements Judge {
  private readonly client: OpenAI;

  constructor(
    readonly model: string,
    client?: OpenAI,
  ) {
    this.client = client ?? new OpenAI();
  }

  async judge(input: JudgeInput): Promise<JudgeVerdict> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_completion_tokens: 4096,
      response_format: { type: "json_object" },
      ...(supportsReasoningEffort(this.model) ? { reasoning_effort: "low" as const } : {}),
      messages: [
        { role: "system", content: JUDGE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Question : ${input.question}
Question hors corpus (refus attendu) : ${input.expectRefusal ? "oui" : "non"}

Réponse de référence :
${input.referenceAnswer}

Extraits fournis à l'assistant :
${input.extracts.length ? formatExtracts(input.extracts) : "(aucun)"}

Réponse de l'assistant :
${input.answer}

Réponds uniquement avec un objet JSON {"score": 1-5, "rationale": "..."}.`,
        },
      ],
    });
    const usage = mapUsage(response.usage);
    const choice = response.choices[0];
    if (!choice || choice.message.refusal || choice.finish_reason === "content_filter") {
      return { score: null, rationale: "Le juge a refusé d'évaluer cette réponse (refus de sécurité).", model: response.model, usage };
    }
    const verdict = parseJudgeOutput(choice.message.content ?? "");
    return { ...verdict, model: response.model, usage };
  }
}
