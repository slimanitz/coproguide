import { z } from "zod";
import { chat } from "@/lib/chat";
import { getDb } from "@/lib/db/client";
import { getProvider } from "@/lib/llm";
import { encodeSse } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  question: z.string().trim().min(3, "Question trop courte").max(2000, "Question trop longue"),
  conversationId: z.string().uuid().nullish(),
});

/**
 * POST /api/chat — streams the answer as Server-Sent Events:
 * meta → text* → citations → usage → done (or error).
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  // Aborted when the client disconnects (request.signal) or the stream is cancelled; it is passed
  // down to the provider so the upstream LLM call stops instead of generating unread tokens.
  const upstream = new AbortController();
  const signal = AbortSignal.any([request.signal, upstream.signal]);
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown): boolean => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(encodeSse(event, data)));
          return true;
        } catch {
          // The consumer went away between two events.
          closed = true;
          upstream.abort();
          return false;
        }
      };
      try {
        for await (const event of chat(
          { db: getDb(), provider: getProvider() },
          { question: parsed.data.question, conversationId: parsed.data.conversationId, signal },
        )) {
          const { type, ...data } = event;
          if (!send(type, data)) break;
        }
      } catch (error) {
        if (!signal.aborted) {
          console.error("[api/chat]", error);
          send("error", { message: "Une erreur est survenue pendant la génération de la réponse." });
        }
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed by a cancel
          }
        }
      }
    },
    cancel() {
      closed = true;
      upstream.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
