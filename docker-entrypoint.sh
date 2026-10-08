#!/bin/sh
# Applies migrations, ingests the corpus (idempotent: unchanged articles are skipped), then serves the app.
set -e
if [ "${INGEST_ON_START:-true}" = "true" ]; then
  node node_modules/tsx/dist/cli.mjs scripts/ingest.ts --prune
else
  node node_modules/tsx/dist/cli.mjs scripts/migrate.ts
fi
exec node node_modules/next/dist/bin/next start -p "${PORT:-3400}" -H "${HOSTNAME:-0.0.0.0}"
