"use client";

import { useMemo, useState } from "react";
import { normalize } from "@/lib/text";

export interface SourceDoc {
  id: string;
  lawCode: string;
  law: string;
  article: string;
  title: string;
  content: string;
  legifranceUrl: string;
  versionDate: string;
}

const LAW_LABELS: Record<string, string> = {
  "65-557": "Loi du 10 juillet 1965 (copropriété)",
  "67-223": "Décret du 17 mars 1967 (copropriété)",
  "89-462": "Loi du 6 juillet 1989 (baux d'habitation)",
};

export function SourcesBrowser({ documents }: { documents: SourceDoc[] }) {
  const [query, setQuery] = useState("");
  const [law, setLaw] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return documents.filter(
      (d) => (law === "all" || d.lawCode === law) && (!q || normalize(`${d.article} ${d.title} ${d.content}`).includes(q)),
    );
  }, [documents, query, law]);

  const groups = Object.keys(LAW_LABELS)
    .map((code) => ({ code, docs: filtered.filter((d) => d.lawCode === code) }))
    .filter((g) => g.docs.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="source-search">
          Rechercher dans les articles
        </label>
        <input
          id="source-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher : majorité, dépôt de garantie, syndic…"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <label className="sr-only" htmlFor="law-filter">
          Filtrer par texte
        </label>
        <select id="law-filter" value={law} onChange={(e) => setLaw(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <option value="all">Tous les textes</option>
          {Object.entries(LAW_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <p className="text-sm text-muted" aria-live="polite">
        {filtered.length} article{filtered.length > 1 ? "s" : ""} sur {documents.length}
      </p>
      {groups.map((group) => (
        <section key={group.code} aria-labelledby={`law-${group.code}`} className="space-y-2">
          <h2 id={`law-${group.code}`} className="text-lg font-semibold">
            {LAW_LABELS[group.code]}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {group.docs.map((d) => (
              <li key={d.id}>
                <details className="group px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3">
                    <span>
                      <span className="font-medium">{d.article}</span> <span className="text-muted">— {d.title}</span>
                    </span>
                    <span className="text-xs text-faint group-open:hidden">Afficher</span>
                  </summary>
                  <div className="mt-3 whitespace-pre-line text-sm leading-relaxed">{d.content}</div>
                  <p className="mt-3 text-xs text-faint">
                    {d.law} · version reproduite {d.versionDate} ·{" "}
                    <a className="underline" href={d.legifranceUrl} target="_blank" rel="noreferrer">
                      Légifrance
                    </a>
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
