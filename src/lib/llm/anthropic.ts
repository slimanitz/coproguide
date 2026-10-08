import Anthropic from "@anthropic-ai/sdk";
import type { Effort } from "../env";
import { OUT_OF_CORPUS_SENTINEL } from "../gate";
import { buildUserTurn, formatExtracts, JUDGE_SYSTEM_PROMPT, SYSTEM_PROMPT } from "../prompts";
import type { GenerateParams, Judge, JudgeInput, JudgeVerdict, LlmEvent, LlmProvider } from "./types";

export interface AnthropicProviderOptions {
  model: string;
  maxTokens: number;
  effort: Effort;
  /** Server-side refusal fallback (`fallbacks: "default"`), Claude API only. */
  serverSideFallback: boolean;
  client?: Anthropic;
}

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * Generation with Claude, streamed. The system prompt is sent as a single text block with
 * cache_control (ephemeral, 5 min): it is byte-stable, so every request after the first
 * reads it from the prompt cache. Retrieved extracts and the question go in the user turn,
 * after the cache breakpoint.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic" as const;
  readonly model: string;
  private readonly client: Anthropic;

  constructor(private readonly options: AnthropicProviderOptions) {
    this.model = options.model;
    this.client = options.client ?? new Anthropic();
  }

  async *stream(params: GenerateParams): AsyncIterable<LlmEvent> {
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...params.history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user", content: buildUserTurn(params.question, params.extracts) },
    ];

    const stream = this.client.beta.messages.stream(
      {
        model: this.options.model,
        max_tokens: this.options.maxTokens,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages,
        // Short grounded answers: low effort keeps latency and cost down (thinking stays adaptive).
        output_config: { effort: this.options.effort },
        ...(this.options.serverSideFallback ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
      },
      { signal: params.signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", text: event.delta.text };
      }
    }

    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      // A safety decline is surfaced as an out-of-corpus refusal rather than a partial answer.
      yield { type: "text", text: `\n${OUT_OF_CORPUS_SENTINEL}` };
    }
    yield {
      type: "usage",
      model: message.model,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }
}

/** Extracts {"score", "rationale"} from the judge output, tolerating surrounding prose. */
export function parseJudgeOutput(text: string): { score: number; rationale: string } {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Judge returned no JSON: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]) as { score?: unknown; rationale?: unknown };
  const score = Number(parsed.score);
  if (!Number.isFinite(score) || score < 1 || score > 5) throw new Error(`Invalid judge score: ${String(parsed.score)}`);
  return { score: Math.round(score), rationale: String(parsed.rationale ?? "") };
}

/**
 * LLM-as-judge with the current Haiku-class model (Haiku 5.5 by default), non-streaming.
 * Haiku 5.5 thinks adaptively by default, so effort is pinned to "low" and max_tokens leaves
 * room for thinking before the short JSON verdict.
 */
export class AnthropicJudge implements Judge {
  private readonly client: Anthropic;

  constructor(
    readonly model: string,
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic();
  }

  async judge(input: JudgeInput): Promise<JudgeVerdict> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      output_config: { effort: "low" },
      // Not cached: the rubric (~300 tokens) is below the 512-token minimum cacheable prefix of
      // Haiku 5.5, and the variable part (question, extracts, answer) follows it.
      system: JUDGE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Question : ${input.question}
Question hors corpus (refus attendu) : ${input.expectRefusal ? "oui" : "non"}

Réponse de référence :
${input.referenceAnswer}

Extraits fournis à l'assistant :
${input.extracts.length ? formatExtracts(input.extracts) : "(aucun)"}

Réponse de l'assistant :
${input.answer}`,
        },
      ],
    });
    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    };
    if (response.stop_reason === "refusal") {
      // Haiku 5.5 has no server-side fallback: record "not judged" instead of failing the run.
      return { score: null, rationale: "Le juge a refusé d'évaluer cette réponse (refus de sécurité).", model: response.model, usage };
    }
    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    const verdict = parseJudgeOutput(text);
    return {
      ...verdict,
      model: response.model,
      usage,
    };
  }
}
