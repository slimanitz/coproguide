import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "@/lib/rrf";

describe("reciprocalRankFusion", () => {
  it("scores each item as the sum of 1/(k + rank) over the lists", () => {
    const fused = reciprocalRankFusion(
      [
        { name: "vector", items: ["a", "b", "c"] },
        { name: "text", items: ["b", "d"] },
      ],
      (x) => x,
      60,
    );
    const score = Object.fromEntries(fused.map((f) => [f.item, f.score]));
    expect(score.b).toBeCloseTo(1 / 62 + 1 / 61);
    expect(score.a).toBeCloseTo(1 / 61);
    expect(score.d).toBeCloseTo(1 / 62);
    expect(fused[0].item).toBe("b");
    expect(fused.find((f) => f.item === "b")!.ranks).toEqual({ vector: 2, text: 1 });
  });

  it("rewards agreement between retrievers over a single top rank", () => {
    const fused = reciprocalRankFusion(
      [
        { name: "vector", items: ["solo", "both"] },
        { name: "text", items: ["x", "both"] },
      ],
      (s) => s,
    );
    expect(fused[0].item).toBe("both");
  });

  it("deduplicates by key and handles empty lists", () => {
    const fused = reciprocalRankFusion(
      [
        { name: "a", items: [{ id: 1 }, { id: 2 }] },
        { name: "b", items: [] },
      ],
      (o) => o.id,
    );
    expect(fused.map((f) => f.item.id)).toEqual([1, 2]);
    expect(reciprocalRankFusion([], (x: string) => x)).toEqual([]);
  });
});
