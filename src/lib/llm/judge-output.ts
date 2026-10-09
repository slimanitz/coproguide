/** Extracts {"score", "rationale"} from a judge's output, tolerating surrounding prose. */
export function parseJudgeOutput(text: string): { score: number; rationale: string } {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Judge returned no JSON: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]) as { score?: unknown; rationale?: unknown };
  const score = Number(parsed.score);
  if (!Number.isFinite(score) || score < 1 || score > 5) throw new Error(`Invalid judge score: ${String(parsed.score)}`);
  return { score: Math.round(score), rationale: String(parsed.rationale ?? "") };
}
