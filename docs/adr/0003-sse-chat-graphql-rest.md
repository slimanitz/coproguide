# ADR 0003 — Server-Sent Events for the chat, GraphQL for everything else

- Status: accepted
- Date: 2026-10-08

## Context

The product has two very different interaction styles:

- **asking a question**: a single long-running request whose answer is produced token by token
  over several seconds, followed by structured trailers (citations, token usage, cost, refusal
  flag);
- **reading data**: conversations, documents, search hits, evaluation runs and dashboard
  metrics, with nested relations (message → citations → document) that the UI selects
  differently per page.

GraphQL subscriptions (over WebSocket or SSE) could carry the stream, but they need a
long-lived transport, extra server plumbing in a Next.js route handler and a client library,
for what is a one-shot, unidirectional stream.

## Decision

- `POST /api/chat` is a plain route handler returning `text/event-stream`, with typed events:
  `meta` (conversation id, extract count, best similarity), `text` (deltas), `citations`,
  `usage` (tokens, model, cost €, latency), `done` (refused, reason, message id) and `error`.
  The browser reads it with `fetch` + a small incremental SSE parser (`src/lib/sse.ts`, unit
  tested against arbitrary chunk boundaries).
- Everything else goes through GraphQL Yoga at `/api/graphql` (GraphiQL in development):
  queries `conversations`, `conversation`, `documents`, `document`, `search`, `evalRuns`,
  `evalRun`, `metrics`; mutations `createConversation`, `deleteConversation`, `runEval`
  (asynchronous, returns the run id). There is deliberately no `ask` mutation.
- Resolvers depend on a `Repository` interface, so they are unit-tested with an in-memory fake.

## Consequences

- Streaming works through any HTTP proxy that does not buffer (`X-Accel-Buffering: no`), can be
  tested with `curl -N`, and cancellation is just aborting the fetch (the abort signal is passed
  down to the Anthropic SDK stream).
- The data API keeps GraphQL's strengths (typed schema, client-chosen shape, one endpoint).
- Two transports to document and secure instead of one; both live in the same Next.js app and
  share the same domain modules (`chat.ts`, `repo.ts`).
