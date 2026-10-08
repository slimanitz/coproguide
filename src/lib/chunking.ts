/**
 * Article-aware chunking.
 *
 * One chunk per article. Articles longer than `maxTokens` are split on paragraph
 * boundaries, with an overlap of roughly `overlapTokens` taken from the end of the
 * previous chunk. Paragraphs larger than the budget are split on sentence boundaries.
 * Metadata (law, article, title) is carried by every chunk, and a short header is
 * prepended so each chunk stays self-describing for both the embedder and the LLM.
 *
 * Overlap caveat: the overlap is made of whole units (paragraphs or sentences) taken from the
 * end of the previous chunk, up to `overlapTokens`. When the last unit alone is larger than the
 * overlap budget, the next chunk starts without overlap rather than cutting that unit mid-way
 * (legal paragraphs are kept intact). The overlap is therefore "at most" `overlapTokens`.
 */
export type TokenCounter = (text: string) => number;

/** Cheap estimate used when no tokenizer is supplied (~4 chars per token for French prose). */
export const approxTokenCount: TokenCounter = (text) => Math.ceil(text.length / 4);

export interface ChunkInput {
  law: string;
  article: string;
  title: string;
  content: string;
}

export interface Chunk {
  chunkIndex: number;
  content: string;
  tokenCount: number;
}

export interface ChunkOptions {
  maxTokens: number;
  overlapTokens: number;
  countTokens?: TokenCounter;
}

function splitSentences(paragraph: string): string[] {
  return paragraph.match(/[^.;:!?]+[.;:!?]+["»)]?\s*|[^.;:!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [paragraph];
}

/** Breaks text into units no larger than maxTokens: paragraphs, else sentences, else hard word windows. */
function toUnits(content: string, maxTokens: number, count: TokenCounter): string[] {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const units: string[] = [];
  for (const paragraph of paragraphs) {
    if (count(paragraph) <= maxTokens) {
      units.push(paragraph);
      continue;
    }
    for (const sentence of splitSentences(paragraph)) {
      if (count(sentence) <= maxTokens) {
        units.push(sentence);
        continue;
      }
      const words = sentence.split(/\s+/);
      let current: string[] = [];
      for (const word of words) {
        if (current.length && count([...current, word].join(" ")) > maxTokens) {
          units.push(current.join(" "));
          current = [];
        }
        current.push(word);
      }
      if (current.length) units.push(current.join(" "));
    }
  }
  return units;
}

/** Collects trailing units of the previous chunk until the overlap budget is reached. */
function overlapTail(units: string[], overlapTokens: number, count: TokenCounter): string[] {
  const tail: string[] = [];
  let tokens = 0;
  for (let i = units.length - 1; i >= 0; i--) {
    const t = count(units[i]);
    if (tokens + t > overlapTokens) break;
    tail.unshift(units[i]);
    tokens += t;
  }
  return tail;
}

export function chunkHeader(input: Pick<ChunkInput, "law" | "article" | "title">): string {
  return `${input.law} — ${input.article} — ${input.title}`;
}

export function chunkArticle(input: ChunkInput, options: ChunkOptions): Chunk[] {
  const count = options.countTokens ?? approxTokenCount;
  const header = chunkHeader(input);
  const headerTokens = count(header) + 1;
  const budget = Math.max(32, options.maxTokens - headerTokens);
  const body = input.content.trim();

  if (count(body) <= budget) {
    const content = `${header}\n${body}`;
    return [{ chunkIndex: 0, content, tokenCount: count(content) }];
  }

  const units = toUnits(body, budget, count);
  const chunks: Chunk[] = [];
  let current: string[] = [];
  let currentTokens = 0;
  let freshUnits = 0; // units in `current` that are not overlap carried from the previous chunk

  const flush = () => {
    if (!freshUnits) return;
    const content = `${header}\n${current.join("\n\n")}`;
    chunks.push({ chunkIndex: chunks.length, content, tokenCount: count(content) });
    current = overlapTail(current, options.overlapTokens, count);
    currentTokens = current.reduce((sum, u) => sum + count(u), 0);
    freshUnits = 0;
  };

  for (const unit of units) {
    const t = count(unit);
    if (currentTokens + t > budget && freshUnits > 0) flush();
    // If the overlap alone leaves no room, drop it rather than exceed the budget.
    while (current.length && currentTokens + t > budget && freshUnits === 0) {
      currentTokens -= count(current.shift()!);
    }
    current.push(unit);
    currentTokens += t;
    freshUnits++;
  }
  flush();
  return chunks;
}
