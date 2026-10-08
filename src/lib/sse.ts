/** Server-Sent Events helpers shared by the /api/chat route (encoder) and the browser client (parser). */
export interface SseMessage {
  event: string;
  data: string;
}

export function encodeSse(event: string, data: unknown): string {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  const lines = payload.split("\n").map((line) => `data: ${line}`);
  return `event: ${event}\n${lines.join("\n")}\n\n`;
}

/**
 * Incremental parser: feed it arbitrary text chunks (network boundaries can split
 * events or lines anywhere) and it emits complete messages.
 */
export function createSseParser(onMessage: (message: SseMessage) => void) {
  let buffer = "";
  let event = "message";
  let data: string[] = [];

  const dispatch = () => {
    if (data.length) onMessage({ event, data: data.join("\n") });
    event = "message";
    data = [];
  };

  const processLine = (line: string) => {
    if (line === "") return dispatch();
    if (line.startsWith(":")) return; // comment / keep-alive
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  };

  return {
    feed(chunk: string) {
      buffer += chunk;
      let index: number;
      while ((index = buffer.search(/\r\n|\n|\r/)) !== -1) {
        const line = buffer.slice(0, index);
        const newlineLength = buffer.startsWith("\r\n", index) ? 2 : 1;
        buffer = buffer.slice(index + newlineLength);
        processLine(line);
      }
    },
    end() {
      if (buffer) processLine(buffer);
      buffer = "";
      dispatch();
    },
  };
}
