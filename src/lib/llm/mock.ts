import { approxTokens, normalize, stemRecall, stemSet } from "../text";
import { OUT_OF_CORPUS_SENTINEL } from "../gate";
import { buildUserTurn, stripHeader, SYSTEM_PROMPT, type Extract } from "../prompts";
import type { GenerateParams, Judge, JudgeInput, JudgeVerdict, LlmEvent, LlmProvider } from "./types";

const MIN_QUESTION_COVERAGE = 0.34;

interface Scored {
  extract: Extract;
  coverage: number;
}

/** Splits an article body into citable units: paragraphs and list items. */
function units(content: string): string[] {
  return stripHeader(content)
    .split(/\n+/)
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
}

function shorten(text: string, max = 320): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))} (…)`;
}

/** Best unit of an extract for the question; keeps the lead-in sentence when the unit is a list item. */
function bestQuote(question: string, extract: Extract, siblings: Extract[]): string {
  const all = units(extract.content);
  let best = all[0] ?? "";
  let bestScore = -1;
  all.forEach((unit) => {
    const score = stemRecall(question, unit);
    if (score > bestScore) {
      best = unit;
      bestScore = score;
    }
  });
  // The lead-in ("Ne sont adoptées qu'à la majorité … concernant :") may live in another chunk of the same article.
  const lead =
    all.find((u) => u.trimEnd().endsWith(":")) ??
    siblings
      .filter((s) => s.docId === extract.docId && s.chunkId !== extract.chunkId)
      .flatMap((s) => units(s.content))
      .find((u) => u.trimEnd().endsWith(":"));
  if (lead && lead !== best && /^([a-z]\)|\d+°|-)/.test(best)) return `${shorten(lead, 200)} … ${shorten(best)}`;
  return shorten(best);
}

function shortLaw(law: string): string {
  const match = law.match(/^(Loi|Décret) n° ([\d-]+) du ([^,]+?\d{4})/);
  return match ? `${match[1].toLowerCase() === "loi" ? "loi" : "décret"} du ${match[3]}` : law;
}

/**
 * Deterministic, offline answer: it ranks the provided extracts by lexical coverage of the
 * question and quotes the most relevant passage of the best two or three articles, with
 * [n] citations. When no extract covers the question it answers with the out-of-corpus
 * sentinel, like the real model is instructed to.
 */
export function mockAnswer(question: string, extracts: Extract[]): string {
  const scored: Scored[] = extracts.map((extract) => ({ extract, coverage: stemRecall(question, extract.content) }));
  const ranked = [...scored].sort((a, b) => b.coverage - a.coverage || a.extract.n - b.extract.n);
  if (!ranked.length || ranked[0].coverage < MIN_QUESTION_COVERAGE) return OUT_OF_CORPUS_SENTINEL;

  const chosen: Scored[] = [];
  const seenArticles = new Set<string>();
  for (const candidate of ranked) {
    if (chosen.length === 3) break;
    if (seenArticles.has(candidate.extract.docId)) continue;
    if (chosen.length && candidate.coverage < ranked[0].coverage * 0.6) break;
    chosen.push(candidate);
    seenArticles.add(candidate.extract.docId);
  }

  const lines = chosen.map(
    ({ extract }) =>
      `- **${extract.article} — ${extract.title}** (${shortLaw(extract.law)}) : « ${bestQuote(question, extract, extracts)} » [${extract.n}]`,
  );
  return [
    "D'après les textes applicables, voici les dispositions les plus pertinentes :",
    "",
    ...lines,
    "",
    "_Réponse générée par le fournisseur simulé (mode démo hors ligne) : elle cite les passages pertinents sans les reformuler. Il s'agit d'une information juridique générale, pas d'un conseil personnalisé ; le texte en vigueur sur Légifrance fait foi._",
  ].join("\n");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockProvider implements LlmProvider {
  readonly name = "mock" as const;
  readonly model: string;
  private calls = 0;

  constructor(
    baseModel: string,
    private readonly delayMs = 0,
  ) {
    this.model = `mock-${baseModel}`;
  }

  async *stream(params: GenerateParams): AsyncIterable<LlmEvent> {
    const first = this.calls++ === 0;
    const answer = mockAnswer(params.question, params.extracts);
    const pieces = answer.match(/\S+\s*/g) ?? [answer];
    for (const piece of pieces) {
      if (params.signal?.aborted) return;
      if (this.delayMs) await sleep(this.delayMs);
      yield { type: "text", text: piece };
    }
    // Simulated usage, shaped like the real API: the system prompt is a cache write on the
    // first call of the process, then a cache read.
    const systemTokens = approxTokens(SYSTEM_PROMPT);
    const historyTokens = params.history.reduce((sum, turn) => sum + approxTokens(turn.content), 0);
    const userTokens = approxTokens(buildUserTurn(params.question, params.extracts));
    yield {
      type: "usage",
      model: this.model,
      usage: {
        inputTokens: userTokens + historyTokens,
        outputTokens: approxTokens(answer),
        cacheReadTokens: first ? 0 : systemTokens,
        cacheWriteTokens: first ? systemTokens : 0,
      },
    };
  }
}

/** Deterministic judge: maps the share of reference-answer stems found in the answer to a 1-5 score. */
export class MockJudge implements Judge {
  readonly model = "mock-judge";

  async judge(input: JudgeInput): Promise<JudgeVerdict> {
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    if (input.expectRefusal) {
      return {
        score: input.refused ? 5 : 1,
        rationale: input.refused ? "Refus attendu pour une question hors corpus." : "Aurait dû refuser : question hors corpus.",
        usage,
        model: this.model,
      };
    }
    if (input.refused) return { score: 1, rationale: "Refus injustifié : la question est couverte par le corpus.", usage, model: this.model };
    const reference = stemSet(input.referenceAnswer);
    const answer = stemSet(normalize(input.answer));
    let hit = 0;
    for (const s of reference) if (answer.has(s)) hit++;
    const recall = reference.size ? hit / reference.size : 0;
    const score = Math.max(1, Math.min(5, 1 + Math.round(recall * 5)));
    return {
      score,
      rationale: `Évaluation simulée : ${Math.round(recall * 100)} % des notions de la réponse de référence retrouvées.`,
      usage,
      model: this.model,
    };
  }
}
