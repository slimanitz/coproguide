"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompact, formatEur, formatMs } from "@/lib/format";

export interface DayPoint {
  day: string;
  requests: number;
  costEur: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

const AXIS = { stroke: "var(--chart-axis)", tick: { fill: "var(--text-faint)", fontSize: 11 }, tickLine: false } as const;
const GRID = { stroke: "var(--chart-grid)", strokeDasharray: undefined, vertical: false } as const;

const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

interface SeriesDef {
  key: keyof DayPoint;
  label: string;
  color: string;
  format: (v: number) => string;
  mark: "bar" | "line";
}

/** Tooltip: values lead (strong), series names follow; keyed with a short stroke of the series color. */
interface TooltipProps {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  label?: string | number;
  series: SeriesDef[];
}

function ChartTooltip({ active, payload, label, series }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as DayPoint;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 text-faint">{dayLabel(String(label))}</p>
      <ul className="space-y-0.5">
        {[...series].reverse().map((s) => (
          <li key={String(s.key)} className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
            <strong className="tabular text-text">{point[s.key] === null ? "—" : s.format(Number(point[s.key]))}</strong>
            <span className="text-muted">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Legend({ series }: { series: SeriesDef[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {series.map((s) => (
        <li key={String(s.key)} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={s.mark === "line" ? "inline-block h-0.5 w-4 rounded" : "inline-block h-2.5 w-2.5 rounded-sm"}
            style={{ background: s.color }}
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function ChartCard({ title, subtitle, series, children }: { title: string; subtitle: string; series?: SeriesDef[]; children: React.ReactNode }) {
  return (
    <figure className="space-y-3 rounded-lg border border-border bg-[var(--chart-surface)] p-4">
      <figcaption className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-faint">{subtitle}</p>
        {series && series.length > 1 && <Legend series={series} />}
      </figcaption>
      <div className="h-56">{children}</div>
    </figure>
  );
}

const COST: SeriesDef[] = [{ key: "costEur", label: "Coût", color: "var(--series-1)", format: formatEur, mark: "bar" }];
const LATENCY: SeriesDef[] = [
  { key: "p50LatencyMs", label: "p50", color: "var(--series-1)", format: formatMs, mark: "line" },
  { key: "p95LatencyMs", label: "p95", color: "var(--series-2)", format: formatMs, mark: "line" },
];
const TOKENS: SeriesDef[] = [
  { key: "inputTokens", label: "Entrée non mise en cache", color: "var(--series-1)", format: formatCompact, mark: "bar" },
  { key: "cacheReadTokens", label: "Lecture cache", color: "var(--series-2)", format: formatCompact, mark: "bar" },
  { key: "cacheWriteTokens", label: "Écriture cache", color: "var(--series-3)", format: formatCompact, mark: "bar" },
  { key: "outputTokens", label: "Sortie", color: "var(--series-4)", format: formatCompact, mark: "bar" },
];

export function DashboardCharts({ data }: { data: DayPoint[] }) {
  if (!data.length) {
    return (
      <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
        Aucune requête sur la période. Posez une question à l&apos;assistant ou lancez <code>pnpm eval</code>.
      </p>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ChartCard title="Coût par jour" subtitle="Euros, génération + juge" series={COST}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="day" tickFormatter={dayLabel} minTickGap={24} {...AXIS} />
            <YAxis tickFormatter={(v: number) => `${v.toLocaleString("fr-FR")} €`} width={64} {...AXIS} axisLine={false} />
            <Tooltip cursor={{ fill: "var(--chart-grid)", opacity: 0.5 }} content={(props) => <ChartTooltip {...props} series={COST} />} />
            <Bar dataKey="costEur" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Latence par jour" subtitle="Millisecondes, p50 et p95 de bout en bout" series={LATENCY}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="day" tickFormatter={dayLabel} minTickGap={24} {...AXIS} />
            <YAxis tickFormatter={(v: number) => formatMs(v)} width={56} {...AXIS} axisLine={false} />
            <Tooltip cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }} content={(props) => <ChartTooltip {...props} series={LATENCY} />} />
            {LATENCY.map((s) => (
              <Line
                key={String(s.key)}
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={{ r: 4, fill: s.color, stroke: "var(--chart-surface)", strokeWidth: 2 }}
                activeDot={{ r: 5, stroke: "var(--chart-surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Répartition des tokens" subtitle="Par jour : entrée, cache (lecture / écriture), sortie" series={TOKENS}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="day" tickFormatter={dayLabel} minTickGap={24} {...AXIS} />
            <YAxis tickFormatter={(v: number) => formatCompact(v)} width={48} {...AXIS} axisLine={false} />
            <Tooltip cursor={{ fill: "var(--chart-grid)", opacity: 0.5 }} content={(props) => <ChartTooltip {...props} series={TOKENS} />} />
            {TOKENS.map((s, i) => (
              <Bar
                key={String(s.key)}
                dataKey={s.key}
                stackId="tokens"
                fill={s.color}
                stroke="var(--chart-surface)"
                strokeWidth={2}
                maxBarSize={24}
                radius={i === TOKENS.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
