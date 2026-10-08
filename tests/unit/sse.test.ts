import { describe, expect, it } from "vitest";
import { createSseParser, encodeSse, type SseMessage } from "@/lib/sse";

function parseAll(chunks: string[]): SseMessage[] {
  const out: SseMessage[] = [];
  const parser = createSseParser((m) => out.push(m));
  chunks.forEach((c) => parser.feed(c));
  parser.end();
  return out;
}

describe("SSE", () => {
  it("round-trips events encoded by the server", () => {
    const wire = encodeSse("text", { text: "Bonjour" }) + encodeSse("done", { refused: false });
    expect(parseAll([wire])).toEqual([
      { event: "text", data: '{"text":"Bonjour"}' },
      { event: "done", data: '{"refused":false}' },
    ]);
  });

  it("handles events split at arbitrary byte boundaries", () => {
    const wire = encodeSse("text", { text: "a\nb" }) + encodeSse("usage", { inputTokens: 1 });
    const chunks = wire.split("");
    const parsed = parseAll(chunks);
    expect(parsed).toHaveLength(2);
    expect(JSON.parse(parsed[0].data)).toEqual({ text: "a\nb" });
  });

  it("joins multi-line data, ignores comments and supports CRLF", () => {
    const parsed = parseAll([": keep-alive\r\nevent: note\r\ndata: line 1\r\ndata: line 2\r\n\r\n", "data: no event name\n\n"]);
    expect(parsed).toEqual([
      { event: "note", data: "line 1\nline 2" },
      { event: "message", data: "no event name" },
    ]);
  });

  it("encodes multi-line string payloads as several data lines", () => {
    expect(encodeSse("raw", "x\ny")).toBe("event: raw\ndata: x\ndata: y\n\n");
  });
});
