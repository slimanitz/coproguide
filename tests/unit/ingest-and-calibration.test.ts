import { afterEach, describe, expect, it } from "vitest";
import { parseArticle } from "@/lib/corpus";
import { candidateThresholds, pickThreshold, scoreThreshold, stratifiedSplit, type SimilaritySample } from "@/lib/evals/calibration";
import { ingestFingerprint, storedHash } from "@/lib/ingest";

const article = parseArticle(
  `---\nlaw: "Loi"\nlaw_code: "65-557"\narticle: "Article 25"\ntitle: "t"\nlegifrance_url: "https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006068256"\nversion_date: "2025-01-01"\nsource: "manual-extract"\n---\n\nTexte.\n`,
  "a.md",
);

describe("ingest fingerprint", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("changes the stored hash when the embedding model, dtype or chunk budget changes", () => {
    const baseline = storedHash(article);
    expect(storedHash(article)).toBe(baseline);
    for (const [key, value] of [
      ["EMBEDDING_MODEL", "intfloat/multilingual-e5-small"],
      ["EMBEDDING_DTYPE", "fp32"],
      ["CHUNK_MAX_TOKENS", "300"],
      ["CHUNK_OVERLAP_TOKENS", "50"],
    ]) {
      process.env = { ...saved, [key]: value };
      expect(storedHash(article), key).not.toBe(baseline);
    }
  });

  it("records the settings in the fingerprint", () => {
    expect(JSON.parse(ingestFingerprint())).toMatchObject({ model: expect.any(String), dtype: expect.any(String), maxTokens: expect.any(Number) });
  });
});

describe("threshold calibration", () => {
  const samples: SimilaritySample[] = [
    { id: "q1", inCorpus: true, best: 0.85 },
    { id: "q2", inCorpus: true, best: 0.9 },
    { id: "q3", inCorpus: true, best: 0.84 },
    { id: "q4", inCorpus: true, best: 0.88 },
    { id: "q5", inCorpus: false, best: 0.8 },
    { id: "q6", inCorpus: false, best: 0.86 },
  ];

  it("scores kept and refused shares", () => {
    expect(scoreThreshold(samples, 0.845)).toMatchObject({ kept: 0.75, refused: 0.5 });
  });

  it("picks the highest-refusal threshold that keeps every in-corpus question", () => {
    const chosen = pickThreshold(samples, candidateThresholds(0.8, 0.9, 0.005));
    expect(chosen.kept).toBe(1);
    expect(chosen.threshold).toBe(0.84);
    expect(chosen.refused).toBe(0.5);
  });

  it("splits deterministically and stratified by class", () => {
    const { calibration, holdout } = stratifiedSplit(samples);
    expect(calibration.map((s) => s.id)).toEqual(["q1", "q3", "q5"]);
    expect(holdout.map((s) => s.id)).toEqual(["q2", "q4", "q6"]);
  });
});
