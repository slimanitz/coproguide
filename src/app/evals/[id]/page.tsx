import Link from "next/link";
import { notFound } from "next/navigation";
import { StatTile } from "@/components/StatTile";
import { getDb } from "@/lib/db/client";
import type { EvalMetrics } from "@/lib/evals/metrics";
import { formatDateTime, formatEur, formatMs, formatPct, shortArticleLabel } from "@/lib/format";
import { createRepository } from "@/lib/repo";

export const dynamic = "force-dynamic";

const CATEGORY: Record<string, string> = { copropriete: "Copropriété", bail: "Bail", "hors-corpus": "Hors corpus" };

export default async function EvalRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const repo = createRepository(getDb());
  const run = await repo.getEvalRun(id);
  if (!run) notFound();
  const results = await repo.listEvalResults(id);
  const m = run.metrics as EvalMetrics | null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <header>
        <Link href="/evals" className="text-sm text-accent hover:underline">
          ← Toutes les évaluations
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{run.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {formatDateTime(run.startedAt)} · {run.provider} ({run.model}) · juge {run.judgeModel} · seuil de similarité {run.minSimilarity} ·{" "}
          {run.status === "running" ? `en cours (${results.length}/50)` : run.status === "failed" ? `échec : ${run.error}` : "terminée"}
        </p>
      </header>

      {m && (
        <section aria-label="Synthèse" className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
          <StatTile label="Rappel@5" value={formatPct(m.recallAt5)} />
          <StatTile label="Rappel@8" value={formatPct(m.recallAt8)} />
          <StatTile label="Précision des citations" value={formatPct(m.citationPrecision)} />
          <StatTile label="Refus corrects" value={formatPct(m.refusalAccuracy)} hint={`Refus à tort : ${formatPct(m.falseRefusalRate)}`} />
          <StatTile label="Note du juge" value={m.judgeScore === null ? "n/a" : `${m.judgeScore.toFixed(2).replace(".", ",")} / 5`} />
          <StatTile label="Latence moyenne" value={formatMs(m.meanLatencyMs)} hint={`p95 ${formatMs(m.p95LatencyMs)}`} />
          <StatTile label="Coût total" value={formatEur(m.totalCostEur)} />
          <StatTile label="Questions" value={String(m.questions)} />
        </section>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="tabular w-full min-w-[60rem] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Question</th>
              <th className="px-3 py-2 font-medium">Attendus</th>
              <th className="px-3 py-2 font-medium">Cités</th>
              <th className="px-3 py-2 text-right font-medium">Rappel@8</th>
              <th className="px-3 py-2 text-right font-medium">Juge</th>
              <th className="px-3 py-2 text-right font-medium">Latence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border align-top">
            {results.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-faint">{r.questionId}</td>
                <td className="px-3 py-2">
                  <details>
                    <summary className="cursor-pointer">
                      <span className="mr-2 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{CATEGORY[r.category] ?? r.category}</span>
                      {r.question}
                      {!r.refusalCorrect && (
                        <span className="ml-2 rounded border border-warn-border bg-warn-bg px-1.5 py-0.5 text-[11px] text-warn-ink">
                          {r.refused ? "⚠︎ refus à tort" : "⚠︎ refus manqué"}
                        </span>
                      )}
                    </summary>
                    <div className="mt-2 space-y-2 text-xs">
                      <p className="whitespace-pre-line rounded bg-surface-2 p-2">{r.answer}</p>
                      <p>
                        <strong>Référence :</strong> {r.referenceAnswer}
                      </p>
                      <p className="text-muted">
                        <strong>Juge :</strong> {r.judgeRationale} · similarité max {r.bestSimilarity?.toFixed(3) ?? "n/a"} · récupérés :{" "}
                        {r.retrievedArticles.join(", ")}
                      </p>
                    </div>
                  </details>
                </td>
                <td className="px-3 py-2 text-xs text-muted">{r.expectedArticles.map(shortArticleLabel).join(", ") || "—"}</td>
                <td className="px-3 py-2 text-xs text-muted">{r.citedArticles.map(shortArticleLabel).join(", ") || (r.refused ? "refus" : "—")}</td>
                <td className="px-3 py-2 text-right">{r.recallAt8 === null ? "—" : formatPct(r.recallAt8, 0)}</td>
                <td className="px-3 py-2 text-right">{r.judgeScore ?? "—"}</td>
                <td className="px-3 py-2 text-right">{formatMs(r.latencyMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
