import { describe, expect, it } from "vitest";
import { articleId, articleNumber, loadCorpus, parseArticle } from "@/lib/corpus";
import { loadGolden, parseGolden } from "@/lib/evals/golden";

describe("corpus", () => {
  it("parses frontmatter and derives stable ids", () => {
    const article = parseArticle(
      `---\nlaw: "Loi n° 65-557 du 10 juillet 1965"\nlaw_code: "65-557"\narticle: "Article 25-1"\ntitle: "Passerelle"\nlegifrance_url: "https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006068256"\nversion_date: "2025-01-01"\nsource: "manual-extract"\n---\n\nLorsque l'assemblée…\n`,
      "x.md",
    );
    expect(article.id).toBe("65-557:25-1");
    expect(article.content).toBe("Lorsque l'assemblée…");
    expect(article.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(articleNumber("Art. 14")).toBe("14");
    expect(articleId("89-462", "Article 22")).toBe("89-462:22");
  });

  it("rejects files with missing metadata", () => {
    expect(() => parseArticle("---\nlaw: x\n---\nbody", "bad.md")).toThrow();
  });

  it("ships about 60 valid articles across the three texts", async () => {
    const corpus = await loadCorpus("corpus");
    expect(corpus.length).toBeGreaterThanOrEqual(55);
    expect(new Set(corpus.map((a) => a.meta.law_code))).toEqual(new Set(["65-557", "67-223", "89-462"]));
    expect(corpus.every((a) => a.meta.source === "manual-extract")).toBe(true);
  });
});

describe("golden set", () => {
  it("has 50 questions, 5 out-of-corpus, and expected articles that exist in the corpus", async () => {
    const golden = await loadGolden();
    const corpusIds = new Set((await loadCorpus("corpus")).map((a) => a.id));
    expect(golden).toHaveLength(50);
    expect(new Set(golden.map((q) => q.id)).size).toBe(50);
    expect(golden.filter((q) => q.category === "hors-corpus")).toHaveLength(5);
    for (const q of golden) {
      if (q.category === "hors-corpus") expect(q.expected_articles, q.id).toEqual([]);
      else expect(q.expected_articles.length, q.id).toBeGreaterThan(0);
      for (const id of q.expected_articles) expect(corpusIds.has(id), `${q.id} -> ${id}`).toBe(true);
    }
  });

  it("reports the offending line on invalid JSONL", () => {
    expect(() => parseGolden('{"id":"q1"}')).toThrow(/line 1/);
  });
});
