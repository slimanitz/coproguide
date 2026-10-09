import Link from "next/link";
import { RunEvalButton } from "@/components/RunEvalButton";
import { getDb } from "@/lib/db/client";
import type { EvalMetrics } from "@/lib/evals/metrics";
import { formatDateTime, formatEur, formatMs, formatPct } from "@/lib/format";
import { createRepository } from "@/lib/repo";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Évaluations — CoproGuide" };

const STATUS: Record<string, string> = { running: "En cours", done: "Terminée", failed: "Échec" };

export default async function EvalsPage() {
  const runs = await createRepository(getDb()).listEvalRuns();
  const running = runs.some((r) => r.status === "running");
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Évaluations</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Jeu de 50 questions de référence (45 dans le corpus, 5 hors corpus). Rappel de la recherche, précision des citations, refus
            corrects, note d&apos;un juge LLM, latence et coût. Lancement en CLI : <code className="rounded bg-surface-2 px-1">pnpm eval</code>.
          </p>
        </div>
        <RunEvalButton running={running} needsToken={env.isPaidProvider} />
      </header>
      {runs.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
          Aucune évaluation pour l&apos;instant. Lancez <code>pnpm eval</code> ou le bouton ci-dessus.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="tabular w-full min-w-[56rem] text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Run</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Fournisseur</th>
                <th className="px-3 py-2 font-medium">Statut</th>
                <th className="px-3 py-2 text-right font-medium">Rappel@5</th>
                <th className="px-3 py-2 text-right font-medium">Rappel@8</th>
                <th className="px-3 py-2 text-right font-medium">Précision cit.</th>
                <th className="px-3 py-2 text-right font-medium">Refus corrects</th>
                <th className="px-3 py-2 text-right font-medium">Juge /5</th>
                <th className="px-3 py-2 text-right font-medium">Latence moy.</th>
                <th className="px-3 py-2 text-right font-medium">Coût</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((run) => {
                const m = run.metrics as EvalMetrics | null;
                return (
                  <tr key={run.id} className="hover:bg-surface-2">
                    <td className="px-3 py-2">
                      <Link className="font-medium text-accent underline-offset-2 hover:underline" href={`/evals/${run.id}`}>
                        {run.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted">{formatDateTime(run.startedAt)}</td>
                    <td className="px-3 py-2 text-muted">
                      {run.provider} · <span className="text-xs">{run.model}</span>
                    </td>
                    <td className="px-3 py-2">{STATUS[run.status] ?? run.status}</td>
                    <td className="px-3 py-2 text-right">{formatPct(m?.recallAt5)}</td>
                    <td className="px-3 py-2 text-right">{formatPct(m?.recallAt8)}</td>
                    <td className="px-3 py-2 text-right">{formatPct(m?.citationPrecision)}</td>
                    <td className="px-3 py-2 text-right">{formatPct(m?.refusalAccuracy)}</td>
                    <td className="px-3 py-2 text-right">{m?.judgeScore?.toFixed(2).replace(".", ",") ?? "n/a"}</td>
                    <td className="px-3 py-2 text-right">{m ? formatMs(m.meanLatencyMs) : "—"}</td>
                    <td className="px-3 py-2 text-right">{m ? formatEur(m.totalCostEur) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
