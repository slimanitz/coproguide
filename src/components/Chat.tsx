"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArticlePanel } from "./ArticlePanel";
import { REFUSAL_MESSAGE } from "@/lib/gate";
import { gql } from "@/lib/gql-client";
import { createSseParser } from "@/lib/sse";
import { formatEur, formatMs, shortArticleLabel } from "@/lib/format";

interface UiCitation {
  n: number;
  docId: string;
  article?: string;
}

interface UiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costEur: number;
  latencyMs: number | null;
}

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: UiCitation[];
  refused: boolean;
  streaming?: boolean;
  usage?: UiUsage;
  error?: string;
}

interface ConversationItem {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

const SUGGESTIONS = [
  "Quelle majorité pour voter des travaux d'amélioration ?",
  "Dans quel délai contester une décision d'assemblée générale ?",
  "Quel est le préavis du locataire pour quitter un logement vide ?",
  "Quel dépôt de garantie pour un logement meublé ?",
];

const LIST_QUERY = /* GraphQL */ `
  query { conversations(limit: 50) { id title updatedAt messageCount } }
`;
const CONVERSATION_QUERY = /* GraphQL */ `
  query Conversation($id: ID!) {
    conversation(id: $id) {
      id
      messages(limit: 100) {
        id role content refused model inputTokens outputTokens cacheReadTokens cacheWriteTokens costEur latencyMs
        citations { n document { id article } }
      }
    }
  }
`;
const DELETE_MUTATION = /* GraphQL */ `
  mutation Delete($id: ID!) { deleteConversation(id: $id) }
`;

/** Turns [n] markers into links the Markdown renderer maps to citation chips. */
function linkCitations(text: string): string {
  return text.replace(/\[(\d+)\](?!\()/g, "[$1](#cite-$1)");
}

function CitationChip({ citation, n, onOpen }: { citation?: UiCitation; n: number; onOpen: (docId: string) => void }) {
  if (!citation) return <sup className="text-xs text-faint">[{n}]</sup>;
  return (
    <button
      type="button"
      onClick={() => onOpen(citation.docId)}
      className="mx-0.5 inline-flex items-center rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 align-baseline text-xs font-medium text-accent hover:border-accent"
      title={`Ouvrir ${shortArticleLabel(citation.docId)}`}
    >
      {citation.n} · {shortArticleLabel(citation.docId)}
    </button>
  );
}

function AssistantMessage({ message, onOpen }: { message: UiMessage; onOpen: (docId: string) => void }) {
  const byNumber = useMemo(() => new Map(message.citations.map((c) => [c.n, c])), [message.citations]);
  const cited = useMemo(() => {
    const seen = new Set<string>();
    return message.citations.filter((c) => (seen.has(c.docId) ? false : (seen.add(c.docId), true)));
  }, [message.citations]);

  if (message.refused) {
    return (
      <div role="note" className="rounded-lg border-l-4 border-warn-border bg-warn-bg px-4 py-3 text-sm text-warn-ink">
        <p className="mb-1 font-semibold">⚠︎ Hors du périmètre documenté</p>
        <div className="prose prose-sm max-w-none prose-answer [&_a]:text-warn-ink">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{REFUSAL_MESSAGE}</ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="prose prose-sm max-w-none prose-answer dark:prose-invert">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => {
              if (href?.startsWith("#cite-")) {
                const n = Number(href.slice(6));
                return <CitationChip n={n} citation={byNumber.get(n)} onOpen={onOpen} />;
              }
              return (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            },
          }}
        >
          {linkCitations(message.content) + (message.streaming ? " ▍" : "")}
        </ReactMarkdown>
      </div>
      {message.error && <p className="text-sm text-danger">{message.error}</p>}
      {cited.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-faint">Sources :</span>
          {cited.map((c) => (
            <CitationChip key={c.docId} n={c.n} citation={c} onOpen={onOpen} />
          ))}
        </div>
      )}
      {message.usage && message.usage.model !== "none" && (
        <p className="tabular text-[11px] text-faint">
          {message.usage.model} · {message.usage.inputTokens + message.usage.cacheReadTokens + message.usage.cacheWriteTokens} tokens en
          entrée (dont {message.usage.cacheReadTokens} lus depuis le cache) · {message.usage.outputTokens} en sortie
          {message.usage.latencyMs !== null && <> · {formatMs(message.usage.latencyMs)}</>} · {formatEur(message.usage.costEur)}
        </p>
      )}
    </div>
  );
}

export function Chat() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [panelDoc, setPanelDoc] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const data = await gql<{ conversations: ConversationItem[] }>(LIST_QUERY);
      setConversations(data.conversations);
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const openConversation = async (id: string) => {
    abortRef.current?.abort();
    setActiveId(id);
    setSidebarOpen(false);
    type Row = {
      id: string;
      role: "user" | "assistant";
      content: string;
      refused: boolean;
      model: string | null;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
      costEur: number;
      latencyMs: number | null;
      citations: { n: number; document: { id: string; article: string } | null }[];
    };
    setLoadError(null);
    let data: { conversation: { messages: Row[] } | null };
    try {
      data = await gql<{ conversation: { messages: Row[] } | null }>(CONVERSATION_QUERY, { id });
    } catch (error) {
      setMessages([]);
      setLoadError(`Impossible de charger cette conversation : ${(error as Error).message}`);
      return;
    }
    if (!data.conversation) {
      setMessages([]);
      setLoadError("Cette conversation n'existe plus.");
      void refreshConversations();
      return;
    }
    setMessages(
      (data.conversation?.messages ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        refused: m.refused,
        citations: m.citations.flatMap((c) => (c.document ? [{ n: c.n, docId: c.document.id, article: c.document.article }] : [])),
        usage: m.role === "assistant" && m.model ? { ...m, model: m.model } : undefined,
      })),
    );
  };

  const newConversation = () => {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setLoadError(null);
    setSidebarOpen(false);
  };

  const deleteConversation = async (id: string) => {
    if (!window.confirm("Supprimer cette conversation ?")) return;
    await gql(DELETE_MUTATION, { id });
    if (id === activeId) newConversation();
    await refreshConversations();
  };

  const ask = async (raw: string) => {
    const question = raw.trim();
    if (question.length < 3 || busy) return;
    setInput("");
    setBusy(true);
    const assistantId = `pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: question, citations: [], refused: false },
      { id: assistantId, role: "assistant", content: "", citations: [], refused: false, streaming: true },
    ]);
    const update = (fn: (m: UiMessage) => UiMessage) => setMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)));

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, conversationId: activeId }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Erreur ${response.status}`);
      }
      const parser = createSseParser(({ event, data }) => {
        const payload = JSON.parse(data);
        switch (event) {
          case "meta":
            if (payload.conversationId) setActiveId(payload.conversationId);
            break;
          case "text":
            update((m) => (m.refused ? m : { ...m, content: m.content + payload.text }));
            break;
          case "refused":
            // Replace any partial text right away: the answer is a refusal.
            update((m) => ({ ...m, refused: true, content: payload.message ?? REFUSAL_MESSAGE }));
            break;
          case "citations":
            update((m) => ({ ...m, citations: payload.citations }));
            break;
          case "usage":
            update((m) => ({ ...m, usage: { ...payload.usage, model: payload.model, costEur: payload.costEur, latencyMs: payload.latencyMs } }));
            break;
          case "done":
            update((m) => ({ ...m, streaming: false, refused: payload.refused, id: payload.messageId ?? m.id }));
            break;
          case "error":
            update((m) => ({ ...m, streaming: false, error: payload.message }));
            break;
        }
      });
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.feed(value);
      }
      parser.end();
    } catch (error) {
      if ((error as Error).name !== "AbortError") update((m) => ({ ...m, error: (error as Error).message }));
    } finally {
      update((m) => ({ ...m, streaming: false }));
      setBusy(false);
      void refreshConversations();
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-7.5rem)] max-w-7xl">
      <aside
        id="conversations-sidebar"
        className={`${sidebarOpen ? "flex" : "hidden"} absolute inset-x-0 z-30 h-[calc(100dvh-7.5rem)] w-full flex-col border-r border-border bg-surface md:static md:flex md:w-72`}
        aria-label="Conversations"
      >
        <div className="p-3">
          <button onClick={newConversation} className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink hover:opacity-90">
            + Nouvelle conversation
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto px-2 pb-3">
          {conversations.length === 0 && <li className="px-2 py-4 text-sm text-faint">Aucune conversation pour l&apos;instant.</li>}
          {conversations.map((c) => (
            <li key={c.id} className="group flex items-center">
              <button
                onClick={() => openConversation(c.id)}
                className={`flex-1 truncate rounded-md px-2 py-2 text-left text-sm ${c.id === activeId ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2"}`}
                aria-current={c.id === activeId ? "true" : undefined}
              >
                {c.title}
              </button>
              <button
                onClick={() => deleteConversation(c.id)}
                className="ml-1 rounded px-1.5 text-faint opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100"
                aria-label={`Supprimer « ${c.title} »`}
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 md:hidden">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            aria-expanded={sidebarOpen}
            aria-controls="conversations-sidebar"
            className="rounded-md border border-border px-2 py-1 text-sm"
          >
            ☰ Conversations
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-6">
            {loadError && (
              <p role="alert" className="rounded-lg border border-danger/40 bg-surface px-4 py-3 text-sm text-danger">
                {loadError}
              </p>
            )}
            {messages.length === 0 && !loadError && (
              <div className="space-y-6 pt-6 text-center">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">Une question sur votre copropriété ou votre bail ?</h1>
                  <p className="mt-2 text-sm text-muted">
                    Réponses sourcées sur la loi du 10 juillet 1965, son décret de 1967 et la loi du 6 juillet 1989. Chaque affirmation renvoie à
                    l&apos;article cité.
                  </p>
                </div>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <li key={s}>
                      <button
                        onClick={() => ask(s)}
                        className="h-full w-full rounded-lg border border-border bg-surface px-4 py-3 text-left text-sm hover:border-accent"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2 text-sm text-accent-ink">{m.content}</p>
                </div>
              ) : (
                <div key={m.id} className="rounded-2xl border border-border bg-surface px-4 py-3" aria-live={m.streaming ? "polite" : undefined}>
                  {m.streaming && !m.content ? <p className="text-sm text-faint">Recherche dans les textes…</p> : <AssistantMessage message={m} onOpen={setPanelDoc} />}
                </div>
              ),
            )}
            <div ref={bottomRef} />
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
          className="border-t border-border bg-surface px-4 py-3"
        >
          <div className="mx-auto flex max-w-3xl gap-2">
            <label htmlFor="question" className="sr-only">
              Votre question
            </label>
            <textarea
              id="question"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask(input);
                }
              }}
              rows={1}
              placeholder="Ex. : Quelle majorité pour changer de syndic ?"
              className="min-h-11 flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2.5 text-sm"
              maxLength={2000}
            />
            <button
              type="submit"
              disabled={busy || input.trim().length < 3}
              className="rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink disabled:opacity-40"
            >
              {busy ? "…" : "Envoyer"}
            </button>
          </div>
        </form>
      </section>
      <ArticlePanel docId={panelDoc} onClose={() => setPanelDoc(null)} />
    </div>
  );
}
