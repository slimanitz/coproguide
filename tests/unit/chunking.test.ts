import { describe, expect, it } from "vitest";
import { approxTokenCount, chunkArticle, chunkHeader } from "@/lib/chunking";

const meta = { law: "Loi n° 65-557 du 10 juillet 1965", article: "Article 25", title: "Majorité absolue" };
const words = (n: number, prefix = "mot") => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");
/** 1 token per whitespace-separated word: makes budgets easy to reason about. */
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe("chunkArticle", () => {
  it("keeps a short article in a single chunk prefixed by its header", () => {
    const chunks = chunkArticle({ ...meta, content: "Ne sont adoptées qu'à la majorité des voix de tous les copropriétaires." }, { maxTokens: 450, overlapTokens: 100 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].content.startsWith(chunkHeader(meta))).toBe(true);
    expect(chunks[0].tokenCount).toBe(approxTokenCount(chunks[0].content));
  });

  it("splits long articles on paragraph boundaries within the token budget", () => {
    const paragraphs = Array.from({ length: 6 }, (_, i) => words(40, `p${i}w`));
    const chunks = chunkArticle({ ...meta, content: paragraphs.join("\n\n") }, { maxTokens: 100, overlapTokens: 0, countTokens: wordCount });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(100);
      expect(chunk.content.startsWith(chunkHeader(meta))).toBe(true);
    }
    // No paragraph is cut in the middle.
    for (const paragraph of paragraphs) expect(chunks.some((c) => c.content.includes(paragraph))).toBe(true);
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
  });

  it("carries trailing paragraphs into the next chunk as overlap", () => {
    const paragraphs = Array.from({ length: 6 }, (_, i) => words(30, `p${i}w`));
    const chunks = chunkArticle({ ...meta, content: paragraphs.join("\n\n") }, { maxTokens: 90, overlapTokens: 35, countTokens: wordCount });
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) {
      const previousLastParagraph = chunks[i - 1].content.split("\n\n").at(-1)!;
      expect(chunks[i].content).toContain(previousLastParagraph);
    }
  });

  it("falls back to sentence then word splitting for oversized paragraphs", () => {
    const giant = words(300);
    const chunks = chunkArticle({ ...meta, content: giant }, { maxTokens: 80, overlapTokens: 0, countTokens: wordCount });
    expect(chunks.length).toBeGreaterThanOrEqual(4);
    for (const chunk of chunks) expect(chunk.tokenCount).toBeLessThanOrEqual(80);
    const rebuilt = chunks.map((c) => c.content.split("\n").slice(1).join(" ")).join(" ");
    expect(rebuilt.split(" ").filter(Boolean)).toEqual(giant.split(" "));
  });
});
