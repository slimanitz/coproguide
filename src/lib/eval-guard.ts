import { timingSafeEqual } from "node:crypto";

export type EvalGuardCode = "FORBIDDEN" | "CONFLICT" | "RATE_LIMITED";

export class EvalGuardError extends Error {
  constructor(
    readonly code: EvalGuardCode,
    message: string,
  ) {
    super(message);
    this.name = "EvalGuardError";
  }
}

export interface EvalGuardInput {
  provider: "mock" | "openai" | "anthropic";
  /** ADMIN_TOKEN configured on the server (undefined/empty = none). */
  configuredToken?: string;
  /** Token sent by the caller in the x-admin-token header. */
  providedToken?: string | null;
  /** Number of runs currently in status "running" (stale runs excluded). */
  runningRuns: number;
  /** Timestamps (ms) of the runs started recently by this process. */
  recentStarts: number[];
  now: number;
  maxRunsPerWindow: number;
  windowMs: number;
}

function sameToken(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Decides whether a new evaluation run may start. Rules, in order:
 * 1. with a paid provider (openai, anthropic), an ADMIN_TOKEN must be configured and supplied;
 * 2. single flight: no other run may be in progress;
 * 3. rate limit: at most `maxRunsPerWindow` starts per `windowMs` in this process.
 * Throws an EvalGuardError, returns the pruned start history otherwise.
 */
export function checkEvalStart(input: EvalGuardInput): number[] {
  if (input.provider !== "mock") {
    if (!input.configuredToken) {
      throw new EvalGuardError("FORBIDDEN", `Les évaluations sont désactivées avec le fournisseur ${input.provider} tant que ADMIN_TOKEN n'est pas configuré.`);
    }
    if (!input.providedToken || !sameToken(input.providedToken, input.configuredToken)) {
      throw new EvalGuardError("FORBIDDEN", "Jeton d'administration manquant ou invalide (en-tête x-admin-token).");
    }
  }
  if (input.runningRuns > 0) {
    throw new EvalGuardError("CONFLICT", "Une évaluation est déjà en cours ; attendez qu'elle se termine.");
  }
  const recent = input.recentStarts.filter((t) => input.now - t < input.windowMs);
  if (recent.length >= input.maxRunsPerWindow) {
    throw new EvalGuardError("RATE_LIMITED", `Limite atteinte : ${input.maxRunsPerWindow} évaluations par ${Math.round(input.windowMs / 60000)} min.`);
  }
  return recent;
}
