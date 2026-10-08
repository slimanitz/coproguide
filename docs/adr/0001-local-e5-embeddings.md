# ADR 0001 — Local e5 embeddings rather than a hosted embedding API

- Status: accepted
- Date: 2026-10-08

## Context

CoproGuide embeds about 60 legal articles (≈ 70 chunks) once, and every user question at query
time. The audience is French (copropriétaires, syndics bénévoles, locataires, bailleurs), the
corpus is French legal prose, and the product must run as a self-contained demo with
`docker compose up`, without any API key. Hosted embedding APIs add a key, a per-call cost, a
network round trip on the critical path of every question and a data-processing question
(questions can contain personal situations).

## Decision

Use `intfloat/multilingual-e5-small` (384 dimensions, strong on French retrieval for its
size), executed locally on CPU through `@huggingface/transformers` (ONNX Runtime). We load the
ONNX conversion published as `Xenova/multilingual-e5-small` with int8 weights (130 MB) because
the upstream `intfloat` repository only ships an fp32 ONNX export (≈ 470 MB); the model name
and dtype stay configurable (`EMBEDDING_MODEL`, `EMBEDDING_DTYPE`). The e5 conventions are
respected: `passage: ` prefix at ingestion, `query: ` prefix at query time, mean pooling and
L2 normalisation, cosine distance in pgvector (HNSW index). The model is downloaded at Docker
build time so the container works offline.

## Consequences

- No key, no cost and no data leaving the machine for retrieval. Measured with `pnpm warm-model`
  (int8 model, 2026-10-08, shared 8-core build machine under load, load average ≈ 8): cold load
  plus first query 3.3-4.1 s, then a warm query embedding takes 32-45 ms (median of 20 runs,
  p95 109-133 ms). The Docker image downloads the model at build time and the server loads it on the
  first question.
- e5-small truncates inputs at 512 tokens: chunks are capped at 450 e5 tokens (instead of the
  1 200 initially planned) so that no article text is silently dropped from its embedding.
- e5 similarities are compressed (most pairs fall in 0.78-0.92), so the confidence threshold
  must be calibrated on the golden set (`pnpm calibrate`) rather than picked a priori; the
  generation-side `[HORS_CORPUS]` sentinel is the second line of defence.
- Changing `EMBEDDING_MODEL`, `EMBEDDING_DTYPE`, `CHUNK_MAX_TOKENS` or `CHUNK_OVERLAP_TOKENS` is
  detected automatically: these settings are part of an ingest fingerprint folded into each
  document's stored hash (`src/lib/ingest.ts`), so the next `pnpm ingest` (or container start)
  re-chunks and re-embeds every article instead of silently mixing vectors from two models.
- A model with another output dimension (e5-base: 768, bge-m3: 1024) additionally needs the
  `vector(384)` column and its HNSW index changed by a migration; a hosted model would need a new
  provider in `embeddings.ts`.
