CREATE TABLE "chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"law" text NOT NULL,
	"article" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"content_tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('french'::regconfig, coalesce(title, '') || ' ' || coalesce(article, '')), 'A') || setweight(to_tsvector('french'::regconfig, content), 'B')) STORED,
	"embedding" vector(384) NOT NULL,
	"token_count" integer NOT NULL,
	"content_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citations" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" uuid NOT NULL,
	"n" integer NOT NULL,
	"doc_id" text NOT NULL,
	"chunk_id" integer,
	"score" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"law_code" text NOT NULL,
	"law" text NOT NULL,
	"article" text NOT NULL,
	"title" text NOT NULL,
	"legifrance_url" text NOT NULL,
	"version_date" text NOT NULL,
	"source" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"question_id" text NOT NULL,
	"question" text NOT NULL,
	"category" text NOT NULL,
	"expected_articles" jsonb NOT NULL,
	"retrieved_articles" jsonb NOT NULL,
	"cited_articles" jsonb NOT NULL,
	"answer" text NOT NULL,
	"reference_answer" text NOT NULL,
	"refused" boolean NOT NULL,
	"best_similarity" double precision,
	"recall_at5" double precision,
	"recall_at8" double precision,
	"citation_precision" double precision,
	"refusal_correct" boolean NOT NULL,
	"judge_score" double precision,
	"judge_rationale" text,
	"latency_ms" integer NOT NULL,
	"cost_eur" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"judge_model" text NOT NULL,
	"min_similarity" double precision NOT NULL,
	"metrics" jsonb,
	"report_path" text,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"origin" text DEFAULT 'chat' NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"refused" boolean DEFAULT false NOT NULL,
	"refusal_reason" text,
	"provider" text,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"cost_eur" double precision DEFAULT 0 NOT NULL,
	"best_similarity" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_doc_id_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_doc_id_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_run_id_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."eval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chunks_doc_chunk_idx" ON "chunks" USING btree ("doc_id","chunk_index");--> statement-breakpoint
CREATE INDEX "chunks_embedding_hnsw_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "chunks_content_tsv_gin_idx" ON "chunks" USING gin ("content_tsv");--> statement-breakpoint
CREATE INDEX "citations_message_idx" ON "citations" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "eval_results_run_idx" ON "eval_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_created_idx" ON "messages" USING btree ("created_at");