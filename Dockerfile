# syntax=docker/dockerfile:1.7
# CoproGuide — Next.js app + ingestion/eval scripts, with the e5 embedding model baked in.
FROM node:22-bookworm-slim AS base
ENV CI=true NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@12.5.1 && mkdir -p /app && chown node:node /app
WORKDIR /app
# Build and run as the unprivileged "node" user: files are created with the right owner,
# so the runtime stage needs no recursive chown layer.
USER node
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Full dependency tree (dev included) to build the app and download the model.
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY --chown=node:node . .
ENV MODEL_CACHE_DIR=/app/.cache/models
RUN pnpm build && rm -rf .next/cache
# Download the embedding model at build time so the container works offline.
RUN pnpm warm-model

# Production dependencies only: what `next start`, the Drizzle migrator, tsx scripts (ingest,
# eval) and the ONNX embedder need. CPU-only inference: GPU execution providers and foreign-OS
# binaries of onnxruntime-node are deleted (~440 MB); the build fails if the layout changes.
FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod \
 && ORT=$(find node_modules/.pnpm -type d -path "*onnxruntime-node/bin/napi-v6" | head -1) \
 && if [ -z "$ORT" ] || [ ! -d "$ORT/linux/x64" ]; then echo "onnxruntime-node binaries not found: update the cleanup step" >&2; exit 1; fi \
 && rm -rf "$ORT/darwin" "$ORT/win32" "$ORT/linux/arm64" \
 && rm -f "$ORT/linux/x64/libonnxruntime_providers_cuda.so" "$ORT/linux/x64/libonnxruntime_providers_tensorrt.so" \
 && rm -rf /home/node/.local/share/pnpm /home/node/.cache

FROM base AS runner
ENV NODE_ENV=production PORT=3400 HOSTNAME=0.0.0.0 MODEL_CACHE_DIR=/app/.cache/models
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/.next ./.next
COPY --chown=node:node --from=build /app/.cache ./.cache
COPY --chown=node:node --from=build /app/next.config.mjs /app/tsconfig.json /app/docker-entrypoint.sh ./
COPY --chown=node:node --from=build /app/src/lib ./src/lib
COPY --chown=node:node --from=build /app/scripts ./scripts
COPY --chown=node:node --from=build /app/corpus ./corpus
COPY --chown=node:node --from=build /app/drizzle ./drizzle
COPY --chown=node:node --from=build /app/evals/golden.jsonl ./evals/golden.jsonl
EXPOSE 3400
ENTRYPOINT ["/app/docker-entrypoint.sh"]
