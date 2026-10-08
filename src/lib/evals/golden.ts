import { readFile } from "node:fs/promises";
import { z } from "zod";

export const goldenQuestionSchema = z.object({
  id: z.string(),
  question: z.string().min(3),
  expected_articles: z.array(z.string().regex(/^\d{2}-\d{3}:[\d-]+$/)),
  reference_answer: z.string(),
  category: z.enum(["copropriete", "bail", "hors-corpus"]),
});

export type GoldenQuestion = z.infer<typeof goldenQuestionSchema>;

export function parseGolden(raw: string): GoldenQuestion[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      try {
        return goldenQuestionSchema.parse(JSON.parse(line));
      } catch (error) {
        throw new Error(`golden.jsonl line ${i + 1}: ${(error as Error).message}`);
      }
    });
}

export async function loadGolden(file = "evals/golden.jsonl"): Promise<GoldenQuestion[]> {
  return parseGolden(await readFile(file, "utf8"));
}
