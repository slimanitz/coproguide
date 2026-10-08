"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { gql } from "@/lib/gql-client";

/** Starts an evaluation through the runEval mutation, then refreshes the page while runs are in progress. */
export function RunEvalButton({ running, needsToken }: { running: boolean; needsToken: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(timer);
  }, [running, router]);

  const start = async () => {
    setPending(true);
    setError(null);
    try {
      await gql<{ runEval: string }>(
        "mutation Run($name: String) { runEval(name: $name) }",
        { name: `ui-${new Date().toISOString().slice(0, 16)}` },
        needsToken ? { "x-admin-token": token } : {},
      );
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {error && (
        <span role="alert" className="text-sm text-danger">
          {error}
        </span>
      )}
      {needsToken && (
        <>
          <label htmlFor="admin-token" className="sr-only">
            Jeton d&apos;administration
          </label>
          <input
            id="admin-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Jeton admin (ADMIN_TOKEN)"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
        </>
      )}
      <button
        onClick={start}
        disabled={pending || running || (needsToken && !token)}
        className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
      >
        {running ? "Évaluation en cours…" : pending ? "Démarrage…" : "Lancer une évaluation"}
      </button>
    </div>
  );
}
