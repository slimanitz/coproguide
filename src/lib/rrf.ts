/** Reciprocal Rank Fusion (Cormack et al., 2009): score(d) = Σ 1 / (k + rank_i(d)), rank starting at 1. */
export interface RankedList<T> {
  name: string;
  items: T[];
}

export interface FusedItem<T> {
  item: T;
  score: number;
  ranks: Record<string, number>;
}

export function reciprocalRankFusion<T>(lists: RankedList<T>[], key: (item: T) => string | number, k = 60): FusedItem<T>[] {
  const fused = new Map<string | number, FusedItem<T>>();
  for (const list of lists) {
    list.items.forEach((item, index) => {
      const id = key(item);
      const rank = index + 1;
      const entry = fused.get(id) ?? { item, score: 0, ranks: {} };
      entry.score += 1 / (k + rank);
      entry.ranks[list.name] = rank;
      fused.set(id, entry);
    });
  }
  return [...fused.values()].sort((a, b) => b.score - a.score);
}
