import { describe, expect, it } from "vitest";
import { compareArticles } from "@/lib/repo";
import { dayRange, fillDays } from "@/lib/series";

describe("dashboard series", () => {
  it("builds an inclusive day range ending today", () => {
    const range = dayRange(new Date("2026-10-08T12:00:00Z"), 3);
    expect(range).toEqual(["2026-10-06", "2026-10-07", "2026-10-08"]);
  });

  it("fills missing days with zero counts and null latency", () => {
    const filled = fillDays(
      [{ day: "2026-10-07", requests: 2, costEur: 0.01, p50LatencyMs: 800, p95LatencyMs: 900, inputTokens: 10, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 0 }],
      ["2026-10-06", "2026-10-07"],
    );
    expect(filled[0]).toMatchObject({ day: "2026-10-06", requests: 0, costEur: 0, p50LatencyMs: null });
    expect(filled[1].requests).toBe(2);
  });

  it("orders article numbers naturally", () => {
    const articles = ["Article 25", "Article 14-2-1", "Article 2", "Article 14-2", "Article 14", "Article 10", "Article 25-1"];
    expect([...articles].sort(compareArticles)).toEqual(["Article 2", "Article 10", "Article 14", "Article 14-2", "Article 14-2-1", "Article 25", "Article 25-1"]);
  });
});
