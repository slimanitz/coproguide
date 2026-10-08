# Roadmap

## Done
- Corpus of 60 articles (loi 65-557, décret 67-223, loi 89-462 incl. ALUR furnished-letting
  provisions) as Markdown with frontmatter; Légifrance PISTE refresh script.
- Idempotent ingestion: chunking (450 e5 tokens, 100 overlap), local e5 embeddings, pgvector
  HNSW + French full-text GIN.
- Hybrid retrieval (vector ∪ full-text, RRF k = 60) and a calibrated confidence gate.
- Streaming chat over SSE with citations, refusal handling, conversation history.
- Providers: Claude (Sonnet 5.5, prompt caching, server-side refusal fallback) and a
  deterministic mock; Haiku 5.5 LLM-as-judge.
- Cost ledger in euros, GraphQL API, sources / evals / dashboard pages.
- 50-question golden set, eval runner (CLI + GraphQL mutation), JSON/Markdown reports.
- Docker Compose one-command demo, CI (lint, typecheck, unit + integration tests, eval smoke,
  image build).

## Next
- Real-key evaluation run committed next to the mock one, and prompt tuning against it.
- Cross-encoder re-ranking after RRF (e.g. `bge-reranker-v2-m3` in ONNX) and an ablation in the
  eval report (vector only vs full-text only vs hybrid).
- Article-level LEGIARTI ids and deep links in the corpus (via `pnpm fetch:legifrance`).
- Per-conversation export (PDF) of the answer with its cited articles.
- Rate limiting and basic auth for a public deployment.

## Later
- Broaden the corpus: code de la construction et de l'habitation (copropriétés en difficulté,
  DPE), décret décence 2002-120, décret charges récupérables 87-713, jurisprudence summaries.
- Versioned corpus (answer "as of" a date) using Légifrance version history.
- Multi-tenant mode for syndics with their own règlement de copropriété uploaded as a private
  source.
- Accessibility audit (RGAA) and French-language usability testing.
