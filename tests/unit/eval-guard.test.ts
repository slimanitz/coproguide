import { describe, expect, it } from "vitest";
import { checkEvalStart, EvalGuardError, type EvalGuardInput } from "@/lib/eval-guard";

const base: EvalGuardInput = {
  provider: "mock",
  configuredToken: undefined,
  providedToken: null,
  runningRuns: 0,
  recentStarts: [],
  now: 10_000_000,
  maxRunsPerWindow: 3,
  windowMs: 3_600_000,
};

function codeOf(input: EvalGuardInput): string | null {
  try {
    checkEvalStart(input);
    return null;
  } catch (error) {
    return error instanceof EvalGuardError ? error.code : "UNEXPECTED";
  }
}

describe("checkEvalStart", () => {
  it("allows a mock run without any token", () => {
    expect(codeOf(base)).toBeNull();
  });

  it("refuses paid runs when ADMIN_TOKEN is not configured, or the header is missing or wrong", () => {
    expect(codeOf({ ...base, provider: "openai" })).toBe("FORBIDDEN");
    expect(codeOf({ ...base, provider: "openai", configuredToken: "s3cret", providedToken: "s3cret" })).toBeNull();
    expect(codeOf({ ...base, provider: "anthropic" })).toBe("FORBIDDEN");
    expect(codeOf({ ...base, provider: "anthropic", configuredToken: "s3cret" })).toBe("FORBIDDEN");
    expect(codeOf({ ...base, provider: "anthropic", configuredToken: "s3cret", providedToken: "nope" })).toBe("FORBIDDEN");
    expect(codeOf({ ...base, provider: "anthropic", configuredToken: "s3cret", providedToken: "s3cret" })).toBeNull();
  });

  it("enforces a single run in flight", () => {
    expect(codeOf({ ...base, runningRuns: 1 })).toBe("CONFLICT");
  });

  it("rate-limits starts within the window and forgets old ones", () => {
    const now = base.now;
    expect(codeOf({ ...base, recentStarts: [now - 1000, now - 2000, now - 3000] })).toBe("RATE_LIMITED");
    const pruned = checkEvalStart({ ...base, recentStarts: [now - 4_000_000, now - 1000] });
    expect(pruned).toEqual([now - 1000]);
  });

  it("checks authentication before revealing whether a run is in progress", () => {
    expect(codeOf({ ...base, provider: "anthropic", runningRuns: 1 })).toBe("FORBIDDEN");
  });
});
