import { describe, expect, it } from "vitest";
import { aggregate, citationGroundedness, citationPrecision, mean, percentile, recallAtK, type QuestionOutcome } from "@/lib/evals/metrics";

describe("eval metrics", () => {
  it("computes recall@k on distinct retrieved articles", () => {
    expect(recallAtK(["65-557:25", "65-557:25-1"], ["65-557:24", "65-557:25", "65-557:26"], 5)).toBe(0.5);
    expect(recallAtK(["65-557:25"], ["a", "b", "c", "d", "e", "65-557:25"], 5)).toBe(0);
    expect(recallAtK([], ["a"], 5)).toBeNull();
  });

  it("computes citation precision against expected articles", () => {
    expect(citationPrecision(["65-557:25", "65-557:24"], ["65-557:25"])).toBe(0.5);
    expect(citationPrecision(["65-557:25", "65-557:25"], ["65-557:25"])).toBe(1);
    expect(citationPrecision([], ["65-557:25"])).toBeNull();
  });

  it("flags citation numbers that point to no extract", () => {
    expect(citationGroundedness([1, 2, 9], 8)).toBeCloseTo(2 / 3);
    expect(citationGroundedness([], 8)).toBeNull();
  });

  it("aggregates refusal accuracy, false refusals, latency and cost", () => {
    const base: QuestionOutcome = { category: "copropriete", refused: false, recallAt5: 1, recallAt8: 1, citationPrecision: 1, citationGroundedness: 1, judgeScore: 5, latencyMs: 100, costEur: 0.01 };
    const metrics = aggregate([
      base,
      { ...base, refused: true, recallAt5: 0, recallAt8: 0.5, citationPrecision: null, judgeScore: 1, latencyMs: 300 },
      { ...base, category: "hors-corpus", refused: true, recallAt5: null, recallAt8: null, citationPrecision: null, latencyMs: 50, costEur: 0 },
      { ...base, category: "hors-corpus", refused: false, recallAt5: null, recallAt8: null, citationPrecision: 0, judgeScore: 1, latencyMs: 50 },
    ]);
    expect(metrics.questions).toBe(4);
    expect(metrics.recallAt5).toBe(0.5);
    expect(metrics.recallAt8).toBe(0.75);
    expect(metrics.citationPrecision).toBe(1);
    expect(metrics.refusalAccuracy).toBe(0.5);
    expect(metrics.falseRefusalRate).toBe(0.5);
    expect(metrics.judgeScore).toBe(3);
    expect(metrics.meanLatencyMs).toBe(125);
    expect(metrics.totalCostEur).toBeCloseTo(0.03);
  });

  it("has well-defined mean and percentile helpers", () => {
    expect(mean([1, null, 3])).toBe(2);
    expect(mean([null])).toBeNull();
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 95)).toBe(100);
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([], 95)).toBe(0);
  });
});
