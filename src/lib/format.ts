export const formatEur = (value: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: value < 1 ? 4 : 2, maximumFractionDigits: value < 1 ? 4 : 2 }).format(value);

export const formatInt = (value: number) => new Intl.NumberFormat("fr-FR").format(Math.round(value));

export const formatCompact = (value: number) => new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export const formatPct = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined ? "n/a" : `${(value * 100).toFixed(digits).replace(".", ",")} %`;

export const formatMs = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1).replace(".", ",")} s` : `${Math.round(value)} ms`);

export const formatDateTime = (value: string | Date) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(value));

/** "65-557:25" -> "art. 25 (loi 65-557)" */
export function shortArticleLabel(docId: string): string {
  const [law, article] = docId.split(":");
  const kind = law === "67-223" ? "décret" : "loi";
  return `art. ${article} (${kind} ${law})`;
}
