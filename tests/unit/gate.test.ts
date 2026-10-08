import { describe, expect, it } from "vitest";
import { isOutOfCorpusAnswer, OUT_OF_CORPUS_SENTINEL, retrievalGate } from "@/lib/gate";
import { SentinelFilter } from "@/lib/sentinel-filter";

describe("retrievalGate", () => {
  it("passes when the best similarity reaches the threshold", () => {
    expect(retrievalGate(0.85, 0.83)).toEqual({ pass: true, bestSimilarity: 0.85 });
    expect(retrievalGate(0.83, 0.83).pass).toBe(true);
  });

  it("refuses below the threshold or without results", () => {
    expect(retrievalGate(0.8, 0.83)).toEqual({ pass: false, reason: "low_similarity", bestSimilarity: 0.8 });
    expect(retrievalGate(null, 0.83)).toEqual({ pass: false, reason: "no_results", bestSimilarity: null });
  });
});

describe("SentinelFilter", () => {
  const run = (pieces: string[]) => {
    const filter = new SentinelFilter();
    const forwarded = pieces.map((p) => filter.push(p)).join("") + filter.flush();
    return { forwarded, out: filter.isOutOfCorpus, text: filter.text };
  };

  it("never leaks a sentinel split across stream chunks", () => {
    const result = run(["[HORS", "_COR", "PUS]"]);
    expect(result.forwarded).toBe("");
    expect(result.out).toBe(true);
  });

  it("forwards normal answers as soon as they cannot be the sentinel", () => {
    const filter = new SentinelFilter();
    expect(filter.push("[")).toBe("");
    expect(filter.push("1] La majorité")).toBe("[1] La majorité");
    expect(filter.push(" de l'article 25")).toBe(" de l'article 25");
    expect(filter.isOutOfCorpus).toBe(false);
  });

  it("detects a sentinel emitted after some text", () => {
    const result = run(["Je ne sais pas. ", OUT_OF_CORPUS_SENTINEL]);
    expect(result.out).toBe(true);
    expect(isOutOfCorpusAnswer(result.text)).toBe(true);
  });
});

describe("SentinelFilter in released mode (text already forwarded)", () => {
  const forwardAll = (pieces: string[]) => {
    const filter = new SentinelFilter();
    const forwarded = pieces.map((p) => filter.push(p)).join("") + filter.flush();
    return { forwarded, filter };
  };

  it("strips a sentinel that appears mid-answer, split across chunks", () => {
    const { forwarded, filter } = forwardAll(["La majorité de l'article 25 [1]. ", "Mais [HORS", "_CORPUS", "] voilà."]);
    expect(forwarded).not.toContain("HORS");
    expect(forwarded).not.toContain("[HORS");
    expect(forwarded).toBe("La majorité de l'article 25 [1]. Mais  voilà.");
    expect(filter.isOutOfCorpus).toBe(true);
    expect(filter.visibleText).not.toContain(OUT_OF_CORPUS_SENTINEL);
  });

  it("strips the sentinel appended after a safety refusal (\\n[HORS_CORPUS] at the end)", () => {
    const { forwarded, filter } = forwardAll(["Début de réponse", `\n${OUT_OF_CORPUS_SENTINEL}`]);
    expect(forwarded).toBe("Début de réponse\n");
    expect(filter.isOutOfCorpus).toBe(true);
  });

  it("releases a held-back bracket that turns out not to be the sentinel", () => {
    const filter = new SentinelFilter();
    expect(filter.push("Voir l'extrait [")).toBe("Voir l'extrait ");
    expect(filter.push("H")).toBe("");
    expect(filter.push("ORS d'œuvre]")).toBe("[HORS d'œuvre]");
    expect(filter.flush()).toBe("");
    expect(filter.isOutOfCorpus).toBe(false);
  });
});
