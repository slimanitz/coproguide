import { describe, expect, it } from "vitest";
import { citedNumbers, resolveCitations } from "@/lib/citations";
import type { Extract } from "@/lib/prompts";

const extract = (n: number, docId: string): Extract => ({
  n,
  docId,
  chunkId: n * 10,
  law: "Loi",
  article: `Article ${docId.split(":")[1]}`,
  title: "t",
  content: "c",
  score: 0.03,
  similarity: 0.85,
});

describe("citations", () => {
  it("extracts [n], [n][m] and [n, m] markers in order of appearance", () => {
    expect(citedNumbers("Selon l'article 25 [2][1]. Voir aussi [3, 1] et [2].")).toEqual([2, 1, 3]);
    expect(citedNumbers("Aucune citation.")).toEqual([]);
  });

  it("keeps only numbers that map to provided extracts", () => {
    const resolved = resolveCitations("Majorité de l'article 25 [1]. Passerelle [2]. Inventé [9].", [extract(1, "65-557:25"), extract(2, "65-557:25-1")]);
    expect(resolved.map((c) => c.docId)).toEqual(["65-557:25", "65-557:25-1"]);
    expect(resolved[0]).toMatchObject({ n: 1, chunkId: 10, article: "Article 25" });
  });
});
