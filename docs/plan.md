# CoproGuide — RAG assistant for French copropriété & tenancy law, with evals

Repo: `coproguide`. Stack: Next.js 15 (App Router, TypeScript, Tailwind), Node 22, PostgreSQL 16
+ pgvector, Drizzle ORM, local embeddings with `@huggingface/transformers` (model
`intfloat/multilingual-e5-small`, no API key), Claude API via `@anthropic-ai/sdk` for
generation and LLM-as-judge, GraphQL Yoga, Vitest, Docker Compose.

IMPORTANT for the builder: before writing any code that calls the Claude API, load the
`claude-api` skill (Skill tool) to get the current model ids, prompt caching and streaming
APIs. Use the latest Sonnet-class model for generation and the latest Haiku-class model for the
judge, read from env with sensible defaults.

Pitch: an assistant that answers questions about the loi du 10 juillet 1965 (copropriété), its
décret of 1967, the loi du 6 juillet 1989 (baux d'habitation) and the loi ALUR, with cited
articles, streaming answers, a confidence gate that refuses when retrieval is weak, hybrid
search, prompt caching, and a 50-question evaluation harness with a cost/latency dashboard.
Legal disclaimer in the UI: information, not legal advice.

## Reserved ports
| Component | Port |
|---|---|
| web | 3400 |
| Postgres (pgvector/pgvector:pg16) | 5438 |

## Layout
```
src/app/                 pages: / (chat), /sources, /evals, /dashboard, api/chat (SSE), api/graphql
src/lib/                 db (drizzle), embeddings, retrieval (hybrid + RRF), llm (provider
                         interface: anthropic | mock), chunking, cost, prompts
src/graphql/             schema (SDL) + resolvers (Yoga)
corpus/                  markdown files with frontmatter (one file per article)
scripts/                 ingest.ts, eval.ts, fetch-legifrance.ts
evals/golden.jsonl       50 questions
drizzle/                 migrations
docker-compose.yml       db + web
docs/
```

## Corpus
- Frontmatter per file: `law` (e.g. "Loi n° 65-557 du 10 juillet 1965"), `article` ("Article 25"),
  `title`, `legifrance_url` (the LEGIARTI/LEGITEXT url), `version_date`, `source: "manual-extract"`.
  Body = article text in French.
- Ship about 60 articles: loi 65-557 (art. 1-4, 6-10, 14, 14-1, 14-2, 17, 18, 18-1, 19, 19-2,
  21, 22, 24, 25, 25-1, 26, 29-1, 42, 44), décret 67-223 (art. 1-11, 33), loi 89-462
  (art. 1, 3, 6, 7, 10, 12, 15, 17, 17-1, 17-2, 20-1, 22, 22-1, 25-3 à 25-9 for meublés). Write
  the texts as faithfully as you can; put a visible banner in the README and the /sources page:
  "Extraits reproduits à titre de démonstration — faire foi sur Légifrance" with the link.
- `scripts/fetch-legifrance.ts`: if `PISTE_CLIENT_ID/SECRET` are set, fetches the current
  consolidated version of the listed articles through the Légifrance PISTE API
  (`/consult/getArticle` with LEGIARTI ids) and rewrites the corpus files; otherwise prints
  how to get credentials. Must be implemented against the documented API shape even if untested.

## Ingestion (`pnpm ingest`)
Parse corpus → chunks (one chunk per article; split articles over 1 200 tokens into
paragraph-aligned chunks with 100 token overlap; keep article metadata on every chunk) →
embeddings with e5 (`passage: ` prefix; `query: ` prefix at query time) → `chunks` table:
id, doc_id, law, article, title, content, content_tsv (generated tsvector 'french'), embedding
vector(384), token_count. HNSW index (cosine) + GIN on tsvector. Idempotent (content hash).

## Retrieval
`hybridSearch(query, k=8)`: vector top-20 (cosine) ∪ full-text top-20 (`plainto_tsquery('french')`
with ts_rank_cd) → Reciprocal Rank Fusion (k=60) → top-k. Returns scores. Confidence gate:
if best cosine similarity < `RAG_MIN_SIMILARITY` (default 0.80 for e5-small; calibrate on the
golden set and document the chosen value) OR the LLM answers with the sentinel
`[HORS_CORPUS]`, respond with the refusal message suggesting to consult Légifrance / ANIL.

## Generation
System prompt (cached with `cache_control` ephemeral): persona, rules (answer in French, cite
with [n] mapping to provided extracts only, say `[HORS_CORPUS]` if extracts don't cover the
question, never invent article numbers, legal disclaimer). User turn: question + numbered
extracts. Streaming through `/api/chat` as SSE (`text`, `citations`, `usage`, `done` events).
Store conversation, messages, citations, usage (input/output/cache read/cache write tokens),
latency ms, cost € (price table in `src/lib/cost.ts` with the prices from the claude-api skill),
model id. `LLM_PROVIDER=mock` returns deterministic answers for tests and offline demo.

## GraphQL (`/api/graphql`, Yoga, GraphiQL enabled in dev)
Queries: `conversations`, `conversation(id)`, `documents(law)`, `document(id)`, `search(query,k)`,
`evalRuns`, `evalRun(id)`, `metrics(from,to)` (totals, avg latency, cost by day, cache hit rate).
Mutations: `createConversation`, `deleteConversation`, `runEval(name)` (async, returns run id).
`ask` stays on the SSE route; document why in an ADR.

## Evals (`pnpm eval`, `evals/golden.jsonl`)
50 questions, each: `{id, question, expected_articles: ["65-557:25"], reference_answer,
category: "copropriete"|"bail"|"hors-corpus"}` with 5 hors-corpus questions expecting refusal.
Metrics: retrieval recall@5 and @8 (expected articles among retrieved), citation precision
(cited articles ⊆ expected or at least in retrieved), refusal accuracy on hors-corpus, judge
score 1-5 (Haiku judge with rubric: correctness vs reference, groundedness, French quality),
mean latency, total cost. Writes `eval_runs` + `eval_results` tables and `evals/reports/
<timestamp>.json` + markdown summary. `/evals` page lists runs and per-question results.
Provide a committed example report produced with the mock provider AND, if `ANTHROPIC_API_KEY`
is present at build time, one real run (do not commit the key; if no key, state it in the report).

## Dashboard (`/dashboard`)
Cards: requests, total cost, avg latency, cache hit rate (cache_read / input tokens); charts:
cost per day, latency p50/p95 per day, tokens split. Load the `dataviz` skill before building
the charts. Use Recharts.

## UI
Chat page: left sidebar with conversations, main chat with streaming markdown, citation chips
that open the article side panel, "Sources" page listing laws/articles with search, refusal
styling, disclaimer footer. French copy. Clean, accessible, light/dark via prefers-color-scheme.

## Tests (Vitest)
Unit: chunker, RRF, cost calculation, confidence gate, SSE parser, GraphQL resolvers with a
mocked db. Integration (needs the compose db): ingest fixture of 5 articles → hybrid search
returns the expected article first → chat with mock provider returns citations. CI: pgvector
service container, `pnpm lint && pnpm typecheck && pnpm test`.

## Milestones
1. Schema + ingest + hybrid search + tests. 2. Chat SSE with mock + anthropic providers,
caching, cost tracking. 3. GraphQL + pages. 4. Evals + dashboard. 5. Docs (ADRs: "local e5
embeddings over hosted", "hybrid RRF over pure vector", "SSE for chat, GraphQL for the rest").

## Acceptance
- `docker compose up -d --build` (mock provider by default) → http://localhost:3400, ask
  "Quelle majorité pour voter des travaux d'amélioration ?" → answer cites art. 25/26.
- With a real key, same question gives a grounded French answer with citations.
- `pnpm test` green, `pnpm eval` runs with mock, `/dashboard` renders.

---

## Implementation notes (added by the builder, 2026-10-08)

### Models and pricing
- Generation: `claude-sonnet-5-5` (latest Sonnet-class), judge: `claude-haiku-5-5` (latest
  Haiku-class per the claude-api skill model table cached 2026-10-06; the first version of the
  repo used `claude-haiku-4-5`, the current Haiku in the skill's earlier 2026-09-25 table), both
  overridable with `ANTHROPIC_MODEL` / `ANTHROPIC_JUDGE_MODEL`. The judge runs with
  `output_config.effort = "low"` (Haiku 5.5 thinks adaptively by default), `max_tokens` 4096,
  and a safety refusal is recorded as "not judged" (`judge_score` null) because Haiku 5.5 has
  no server-side fallback.
- Generation uses `client.beta.messages.stream` with the system prompt as one text block with
  `cache_control: {type: "ephemeral"}`, `output_config.effort = "low"` (short grounded answers),
  and server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`,
  disable with `ANTHROPIC_FALLBACKS=off`). A `refusal` stop reason is mapped to the out-of-corpus refusal.
- Price table (`src/lib/cost.ts`, USD / MTok, from the claude-api skill, 2026-09-25): Sonnet 5.5
  2 / 10, cache read 0.20, cache write (5 min) 2.50; Haiku 4.5 1 / 5, 0.10, 1.25; plus Opus 5.5,
  Opus 5, Sonnet 5, Sonnet 4.6, Fable 5.1. Converted to € with `USD_TO_EUR` (default 0.86).
- Haiku 5.5 is priced 0.10 / 0.50 USD per MTok (prompts up to 100K tokens), cache read 0.01,
  cache write 0.125 (0.1x / 1.25x input, the skill gives no specific cache rate).
- The judge prompt is not cached: its rubric (~300 tokens) is below Haiku 5.5's 512-token minimum
  cacheable prefix.

### Calibration of `RAG_MIN_SIMILARITY` (`pnpm calibrate`, golden set, e5-small q8)
- Best cosine similarity, in-corpus questions: 0.843 – 0.912; hors-corpus: 0.799, 0.812, 0.828,
  0.856, 0.873.
- Chosen value **0.83**: keeps 100 % of in-corpus questions and refuses 3/5 hors-corpus
  questions before any LLM call. The two remaining ones (a fiscal question and the *bail
  commercial 3-6-9* question) are semantically close to the corpus and are left to the
  model's `[HORS_CORPUS]` sentinel. 0.86 would refuse 4/5 but also 18 % of legitimate
  questions, which is worse for users.

### Deviations from the plan
1. **Embedding model repository**: `intfloat/multilingual-e5-small` only publishes an fp32 ONNX
   export (~470 MB) that transformers.js cannot load as a quantised model. The default is the
   ONNX conversion of the same model, `Xenova/multilingual-e5-small`, int8 (`q8`, 130 MB).
   `EMBEDDING_MODEL=intfloat/multilingual-e5-small EMBEDDING_DTYPE=fp32` also works.
2. **Chunk size**: e5-small truncates its input at 512 tokens, so a 1 200-token chunk would be
   embedded from its first ~500 tokens only. Chunks are capped at **450 e5 tokens** (header
   included) with the planned **100-token overlap**, paragraph-aligned; 8 long articles are
   split into 2 chunks (68 chunks for 60 articles). Configurable via `CHUNK_MAX_TOKENS`.
   Overlap caveat: the overlap is built from whole paragraphs/sentences of the previous chunk, up
   to 100 tokens; when the last paragraph alone exceeds 100 tokens the next chunk starts without
   overlap instead of cutting the paragraph. Changing the model, dtype or chunk settings changes
   the ingest fingerprint stored in each document hash, which forces a full re-ingestion.
3. **Full-text query**: `plainto_tsquery('french', q)` is used, but its `&` operators are
   rewritten to `|` before ranking with `ts_rank_cd`: requiring every word of a natural
   question returned no lexical candidates for most golden questions.
4. **Corpus article list** (60 articles instead of the 58 listed):
   - décret 67-223 art. 1 to 3 were replaced by art. 13 (decisions limited to the agenda),
     14 (attendance sheet), 17 (minutes) and 18 (start of the 2-month challenge period):
     I could not reproduce art. 1-3 faithfully and they matter less for user questions;
   - loi 65-557 art. 44 was replaced by art. 43 (clauses réputées non écrites) for the same
     reason; art. 14-2-1 (fonds de travaux) was added because art. 14-2 now covers the plan
     pluriannuel de travaux;
   - loi 89-462: all listed articles, 25-3 to 25-9 included (25-9 is a short, explicitly
     abridged extract).
   - "Loi ALUR" is covered through the consolidated articles it amended (meublés 25-3 to 25-9,
     notice periods, deposits, caution), not as a separate text.
5. **`legifrance_url`** points to the consolidated text (LEGITEXT) of each law rather than to
   article-level LEGIARTI ids, which I could not verify offline. `scripts/fetch-legifrance.ts`
   resolves the LEGIARTI id of each article (`/consult/getArticleWithIdandNum`), fetches it
   (`/consult/getArticle`) and rewrites url, text, version date and `source: legifrance-api`.
   It is written against the documented API but untested (no PISTE credentials).
6. **Mock provider usage**: the mock reports estimated token counts (chars / 4), simulates a
   cache write on the first call then cache reads, and is priced as the configured Claude model
   (model id `mock-claude-sonnet-5-5`) so the dashboard and eval costs are realistic estimates.
   The mock judge scores lexical overlap with the reference answer. Mock answer metrics are a
   pipeline smoke test, not a quality measurement.
7. **Real-key eval run**: no `ANTHROPIC_API_KEY` was available at build time, so only the mock
   example report is committed (`evals/reports/example-mock.{json,md}`).
8. **Integration tests** use a dedicated `coproguide_test` database (created automatically next
   to `DATABASE_URL`) and are skipped with a warning when PostgreSQL is unreachable, so
   `pnpm test` stays usable without Docker; CI always runs them against a pgvector service.
9. **Metrics definitions**: cache hit rate = cache_read / (uncached input + cache_read +
   cache_write), since the API's `input_tokens` excludes cached tokens. Citation precision =
   share of cited articles that are expected; a separate "citation groundedness" metric checks
   that every `[n]` maps to a provided extract. Eval answers are also written to `messages`
   with `origin = 'eval'`, so the dashboard covers chat and eval traffic.

### Review fixes (2026-10-08, second pass)
- `runEval` (GraphQL + "Lancer une évaluation" button) is guarded: one run in flight (runs older
  than 2 h count as crashed), at most `EVAL_RATE_LIMIT_PER_HOUR` (default 3) starts per hour per
  process, and with `LLM_PROVIDER=anthropic` a matching `x-admin-token` header (`ADMIN_TOKEN`) is
  required; without `ADMIN_TOKEN` paid runs cannot be started through the API at all.
- The `[HORS_CORPUS]` sentinel is stripped wherever it appears in the stream (start, middle, or
  appended after a `stop_reason: "refusal"`), and the SSE stream emits a `refused` event the
  moment it is detected so the UI replaces any partial text immediately.
- The SSE route aborts the upstream LLM call when the client disconnects (`AbortSignal.any` of
  the request signal and a `cancel` handler) and never throws on a closed controller.
- Pagination: `conversations`, `evalRuns` and `Conversation.messages` take `limit` (1-100) and
  `offset`; the history sent to the model is capped at `CHAT_HISTORY_TURNS` exchanges (default 10).
- `docker compose` reads `.env.example` as defaults plus an optional `.env`, so every documented
  variable works in Docker. `make down` keeps the volume, `make wipe` deletes it.
- The runtime image contains production dependencies only (devDependencies pruned in a
  `prod-deps` stage; `next.config.mjs` instead of `.ts` so `next start` needs no TypeScript).
- `pnpm calibrate --holdout` calibrates the threshold on half of the golden set and reports it on
  the other half (see the README for the figures and the caveat about calibrating on the eval set).
- `pnpm ingest --prune` is now explicit (the container entrypoint passes it).

- **OpenAI as default real provider (2026-10-09, user request)**: an `openai` provider (`src/lib/llm/openai.ts`, Chat Completions API, streaming, `reasoning_effort` for GPT-5 / o-series, usage split into uncached input and cached reads, content-filter refusals mapped to `[HORS_CORPUS]`) and an OpenAI judge (`gpt-5-mini`, JSON output) were added and became the documented real provider; env variables `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-5`), `OPENAI_JUDGE_MODEL`, `OPENAI_REASONING_EFFORT`, optional `OPENAI_BASE_URL`. The Anthropic provider is kept as an alternative (`LLM_PROVIDER=anthropic`). The mock provider is now priced like `gpt-5` (the committed example report was produced when it was priced like Sonnet 5.5). OpenAI prices in `src/lib/cost.ts` are the GPT-5 launch list prices and should be checked against the current pricing page.
