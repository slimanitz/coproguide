/** Lightweight French text utilities used by the mock provider and the mock judge. */
const STOPWORDS = new Set(
  (
    "alors au aucun aussi autre avant avec avoir bon car ce cela ces ceux chaque ci comme comment dans des du dedans dehors depuis devrait doit donc dos " +
    "elle elles en encore est et etre eu fait faites fois font hors ici il ils je juste la le les leur ma maintenant mais mes mine moins mon mot meme ni " +
    "nommes notre nous ou par parce pas peut peu plupart pour pourquoi quand que quel quelle quelles quels qui sa sans ses seulement si sien son sont sous " +
    "soyez sujet sur ta tandis tellement tels tes ton tous tout toute toutes tres tu voient vont votre vous vu ca etait etre une un uns unes lors faut " +
    "quoi quelle combien quelles doit dois peux puis puisje cest qu est-ce estce sont ont avoir faire peut-il peut-on mon ma mes son sa ses leur leurs " +
    "aux cette celui celle ceux elle il on y a l d s n j m t c qu"
  ).split(/\s+/),
);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, " ");
}

/** Crude stemmer: accent-free lowercase words of 4+ letters, truncated to 6 characters. */
export function stems(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    .map((w) => w.slice(0, 6));
}

export function stemSet(text: string): Set<string> {
  return new Set(stems(text));
}

/** Fraction of `query` stems that appear in `text`. */
export function stemRecall(query: string, text: string): number {
  const q = stemSet(query);
  if (q.size === 0) return 0;
  const t = stemSet(text);
  let hit = 0;
  for (const s of q) if (t.has(s)) hit++;
  return hit / q.size;
}

export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
