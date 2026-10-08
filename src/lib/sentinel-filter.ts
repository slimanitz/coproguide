import { OUT_OF_CORPUS_SENTINEL } from "./gate";

const S = OUT_OF_CORPUS_SENTINEL;

/** Length of the longest suffix of `text` that is a proper prefix of the sentinel. */
function partialSentinelSuffix(text: string): number {
  for (let len = Math.min(S.length - 1, text.length); len > 0; len--) {
    if (S.startsWith(text.slice(-len))) return len;
  }
  return 0;
}

/**
 * Filters a streamed answer so the out-of-corpus sentinel never reaches the user, wherever it
 * appears (alone, at the start, mid-answer, or appended after a safety refusal) and however the
 * stream splits it: complete occurrences are removed and a trailing fragment that could start
 * the sentinel is held back until the next chunk disambiguates it.
 */
export class SentinelFilter {
  private pending = "";
  private full = "";

  /** Returns the text that can be forwarded now (never contains the sentinel or a fragment of it). */
  push(text: string): string {
    this.full += text;
    this.pending += text;
    this.pending = this.pending.split(S).join("");
    const hold = partialSentinelSuffix(this.pending);
    const out = this.pending.slice(0, this.pending.length - hold);
    this.pending = this.pending.slice(this.pending.length - hold);
    return out;
  }

  /** True as soon as the complete sentinel has been seen in the stream. */
  get isOutOfCorpus(): boolean {
    return this.full.includes(S);
  }

  /** Releases the held-back fragment at the end of the stream (it was not the sentinel). */
  flush(): string {
    const out = this.pending;
    this.pending = "";
    return out;
  }

  /** Raw text as produced by the model (sentinel included). */
  get text(): string {
    return this.full;
  }

  /** Text as shown to the user (sentinel removed). */
  get visibleText(): string {
    return this.full.split(S).join("");
  }
}
