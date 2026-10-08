import type { DailyMetrics } from "./repo";

export interface FilledDay extends Omit<DailyMetrics, "p50LatencyMs" | "p95LatencyMs"> {
  /** Null on days without requests: the latency line shows a gap rather than a false zero. */
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
}

/** Calendar days (YYYY-MM-DD, Europe/Paris) from `days - 1` days before `end` up to `end`, inclusive. */
export function dayRange(end: Date, days: number): string[] {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(fmt.format(new Date(end.getTime() - i * 86_400_000)));
  return [...new Set(out)];
}

/** Returns one point per day of the range: zero counts on empty days, null latency. */
export function fillDays(rows: DailyMetrics[], range: string[]): FilledDay[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return range.map(
    (day) =>
      byDay.get(day) ?? {
        day,
        requests: 0,
        costEur: 0,
        p50LatencyMs: null,
        p95LatencyMs: null,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
  );
}
