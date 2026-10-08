.PHONY: up down wipe logs install dev db test test-unit lint typecheck ingest eval seed calibrate

up: ## Build and start the whole product (db + web on http://localhost:3400)
	docker compose up -d --build

down: ## Stop and remove containers (keeps the database volume)
	docker compose down

wipe: ## Stop and remove containers AND the database volume (data is lost)
	docker compose down -v

logs:
	docker compose logs -f web

install:
	pnpm install

db: ## Start only PostgreSQL (port 5438) for local development
	docker compose up -d db

dev: db ## Local dev server on :3400 (run `make seed` once)
	pnpm dev

seed: ## Migrate + ingest the corpus into the local database
	pnpm ingest --prune

test: ## Unit + integration tests (integration needs `make db`)
	pnpm test

test-unit:
	pnpm test:unit

lint:
	pnpm lint && pnpm typecheck

typecheck:
	pnpm typecheck

ingest: seed

eval: ## Run the 50-question golden set (mock provider unless LLM_PROVIDER=anthropic)
	pnpm eval

calibrate:
	pnpm calibrate
