import type { TokenUsage } from "../cost";
import type { Extract } from "../prompts";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateParams {
  question: string;
  extracts: Extract[];
  /** Previous turns of the conversation (plain text, oldest first). */
  history: ChatTurn[];
  signal?: AbortSignal;
}

export type LlmEvent = { type: "text"; text: string } | { type: "usage"; usage: TokenUsage; model: string };

export interface LlmProvider {
  readonly name: "mock" | "openai" | "anthropic";
  readonly model: string;
  stream(params: GenerateParams): AsyncIterable<LlmEvent>;
}

export interface JudgeInput {
  question: string;
  referenceAnswer: string;
  answer: string;
  extracts: Extract[];
  expectRefusal: boolean;
  refused: boolean;
}

export interface JudgeVerdict {
  /** 1-5, or null when the judge declined to grade. */
  score: number | null;
  rationale: string;
  usage: TokenUsage;
  model: string;
}

export interface Judge {
  readonly model: string;
  judge(input: JudgeInput): Promise<JudgeVerdict>;
}
