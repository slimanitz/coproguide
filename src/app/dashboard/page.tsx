import Link from "next/link";
import { DashboardCharts } from "@/components/DashboardCharts";
import { StatTile } from "@/components/StatTile";
import { getDb } from "@/lib/db/client";
import { formatCompact, formatEur, formatInt, formatMs, formatPct } from "@/lib/format";
import { createRepository } from "@/lib/repo";
import { dayRange, fillDays } from "@/lib/series";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tableau de bord — CoproGuide" };

const RANGES = [7, 30, 90] as const;
const DAY = 24 * 60 * 60 * 1000;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const params = await searchParams;
  const days = RANGES.find((d) => String(d) === params.days) ?? 30;
  const to = new Date(Date.now() + DAY);
  const from = new Date(to.getTime() - (days + 1) * DAY);
  const metrics = await createRepository(getDb()).metrics(from, to);
  const t = metrics.totals;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="text-sm text-muted">Requêtes, coût, latence et efficacité du cache de prompt (chat et évaluations).</p>
      </header>

      <nav aria-label="Période" className="flex gap-1 text-sm">
        {RANGES.map((d) => (
          <Link
            key={d}
            href={`/dashboard?days=${d}`}
            aria-current={d === days ? "page" : undefined}
            className={`rounded-md border px-3 py-1.5 ${d === days ? "border-accent bg-accent-soft font-medium text-accent" : "border-border text-muted hover:bg-surface-2"}`}
          >
            {d === days ? "✓ " : ""}
            {d} derniers jours
          </Link>
        ))}
      </nav>

      <section aria-label="Indicateurs" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Requêtes" value={formatInt(t.requests)} hint={`dont ${formatInt(t.refusals)} refus`} />
        <StatTile label="Coût total" value={formatEur(t.totalCostEur)} hint={t.requests ? `${formatEur(t.totalCostEur / t.requests)} / requête` : undefined} />
        <StatTile label="Latence moyenne" value={formatMs(t.avgLatencyMs)} hint="bout en bout, recherche incluse" />
        <StatTile
          label="Taux de cache"
          value={formatPct(t.cacheHitRate)}
          hint={`${formatCompact(t.cacheReadTokens)} tokens lus depuis le cache`}
        />
      </section>

      <DashboardCharts data={t.requests ? fillDays(metrics.byDay, dayRange(new Date(), days)) : []} />

      <details className="rounded-lg border border-border bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Données (tableau)</summary>
        <div className="overflow-x-auto px-4 pb-4">
          <table className="tabular w-full min-w-[44rem] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-2 font-medium">Jour</th>
                <th className="py-2 text-right font-medium">Requêtes</th>
                <th className="py-2 text-right font-medium">Coût</th>
                <th className="py-2 text-right font-medium">p50</th>
                <th className="py-2 text-right font-medium">p95</th>
                <th className="py-2 text-right font-medium">Entrée</th>
                <th className="py-2 text-right font-medium">Lecture cache</th>
                <th className="py-2 text-right font-medium">Écriture cache</th>
                <th className="py-2 text-right font-medium">Sortie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {metrics.byDay.map((d) => (
                <tr key={d.day}>
                  <td className="py-1.5">{d.day}</td>
                  <td className="py-1.5 text-right">{formatInt(d.requests)}</td>
                  <td className="py-1.5 text-right">{formatEur(d.costEur)}</td>
                  <td className="py-1.5 text-right">{formatMs(d.p50LatencyMs)}</td>
                  <td className="py-1.5 text-right">{formatMs(d.p95LatencyMs)}</td>
                  <td className="py-1.5 text-right">{formatInt(d.inputTokens)}</td>
                  <td className="py-1.5 text-right">{formatInt(d.cacheReadTokens)}</td>
                  <td className="py-1.5 text-right">{formatInt(d.cacheWriteTokens)}</td>
                  <td className="py-1.5 text-right">{formatInt(d.outputTokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
