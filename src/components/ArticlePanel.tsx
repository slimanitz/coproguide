"use client";

import { useEffect, useRef, useState } from "react";
import { gql } from "@/lib/gql-client";

export interface ArticleDoc {
  id: string;
  law: string;
  article: string;
  title: string;
  content: string;
  legifranceUrl: string;
  versionDate: string;
}

const QUERY = /* GraphQL */ `
  query Document($id: ID!) {
    document(id: $id) { id law article title content legifranceUrl versionDate }
  }
`;

/** Slide-over panel showing the full text of a cited article. */
export function ArticlePanel({ docId, onClose }: { docId: string | null; onClose: () => void }) {
  const [doc, setDoc] = useState<ArticleDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus management: move focus into the dialog on open, restore it to the opener on close.
  useEffect(() => {
    if (!docId) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => opener?.focus();
  }, [docId]);

  useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    setDoc(null);
    setError(null);
    gql<{ document: ArticleDoc | null }>(QUERY, { id: docId })
      .then((data) => !cancelled && (data.document ? setDoc(data.document) : setError("Article introuvable.")))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [docId]);

  useEffect(() => {
    if (!docId) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [docId, onClose]);

  if (!docId) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="article-panel-title">
      <button aria-label="Fermer le panneau" tabIndex={-1} className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-surface shadow-xl">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-border bg-surface px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-faint">{doc?.law ?? "Chargement…"}</p>
            <h2 id="article-panel-title" className="text-lg font-semibold">
              {doc ? `${doc.article} — ${doc.title}` : docId}
            </h2>
          </div>
          <button ref={closeRef} onClick={onClose} className="rounded-md px-2 py-1 text-muted hover:bg-surface-2" aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <p className="rounded-md border border-warn-border bg-warn-bg px-3 py-2 text-xs text-warn-ink">
            Extraits reproduits à titre de démonstration — faire foi sur{" "}
            <a className="underline" href={doc?.legifranceUrl ?? "https://www.legifrance.gouv.fr"} target="_blank" rel="noreferrer">
              Légifrance
            </a>
            .
          </p>
          {error && <p className="text-sm text-danger">{error}</p>}
          {doc && (
            <>
              <div className="whitespace-pre-line text-sm leading-relaxed">{doc.content}</div>
              <p className="text-xs text-faint">
                Version reproduite : {doc.versionDate} ·{" "}
                <a className="underline" href={doc.legifranceUrl} target="_blank" rel="noreferrer">
                  Voir le texte consolidé sur Légifrance
                </a>
              </p>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
