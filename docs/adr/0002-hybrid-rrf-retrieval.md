# ADR 0002 — Hybrid retrieval fused with Reciprocal Rank Fusion rather than pure vector search

- Status: accepted
- Date: 2026-10-08

## Context

Legal questions mix two kinds of signal. Some are lexical and precise ("article 25-1",
"dépôt de garantie", "état daté", "IRL"), where a dense model with 384 dimensions often ranks
a semantically close but wrong article first (24 vs 25, 22 vs 25-6). Others are paraphrases
("élire le syndic" for "désignation du syndic", "quitter mon logement" for "congé du
locataire"), where full-text search fails. Scores from the two retrievers are not comparable
(cosine similarity vs `ts_rank_cd`), so a weighted sum would need constant re-tuning.

## Decision

`hybridSearch(query, k = 8)` runs, in PostgreSQL:

1. vector top-20 by cosine distance on the HNSW index (`vector_cosine_ops`);
2. full-text top-20 on a generated `tsvector` (`french` configuration, article title weighted
   `A`, body `B`, GIN index), ranked with `ts_rank_cd`. The query is built with
   `plainto_tsquery('french', q)` whose `&` operators are turned into `|`: an AND of every
   stemmed word of a natural-language question almost never matches a single article;

then fuses both rankings with Reciprocal Rank Fusion, `score = Σ 1 / (60 + rank)`, and keeps
the top k. Each hit keeps its vector rank, text rank and cosine similarity for debugging and for
the confidence gate (best cosine similarity of the vector list).

## Consequences

- Rank-based fusion needs no score normalisation and is robust when one retriever returns
  nothing (e.g. no lexical overlap).
- On the 45 in-corpus golden questions, recall@8 is 93 % with the hybrid ranking; the misses
  are documented in the eval report rather than hidden.
- The whole retrieval stays inside PostgreSQL: one database, transactional ingestion, no
  separate search engine to operate. At this corpus size (70 chunks) latency is dominated by
  the query embedding, not by SQL.
- A cross-encoder re-ranker could be added after the fusion step later without changing the
  API (see roadmap).
