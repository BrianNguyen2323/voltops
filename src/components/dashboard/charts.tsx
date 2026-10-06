"use client";

import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, XAxis, YAxis } from "recharts";

import type { DashboardData } from "~/app/(protected)/home/data";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";

const hourLabel = (ms: number, tz: string) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: tz }).format(ms);
const localHour = (ms: number, tz: string) =>
  Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(ms));

const timelineConfig = {
  load: { label: "Home use", color: "var(--chart-3)" },
  solar: { label: "Solar", color: "var(--chart-1)" },
  band: { label: "Expected range", color: "var(--chart-3)" },
} satisfies ChartConfig;

type Row = { t: number; load: number; solar: number; band?: [number, number] };
const kwh = (v: number) => `${v.toFixed(1)} kWh`;

type SwatchKind = "home" | "range" | "solar" | "peak";
const HATCH_CSS = "repeating-linear-gradient(135deg, var(--chart-3) 0 1px, transparent 1px 4px)";
const SWATCH: Record<SwatchKind, string> = {
  home: "bg-home h-0.5 w-5",
  range: "size-3.5 rounded-xs",
  solar: "bg-solar size-3.5 rounded-xs",
  peak: "bg-muted size-3.5 rounded-xs",
};
// One mark per series, shared by the legend and the tooltip.
export function Swatch({ kind }: { kind: SwatchKind }) {
  return (
    <span
      aria-hidden
      data-swatch={kind}
      className={`inline-block shrink-0 ${SWATCH[kind]}`}
      style={kind === "range" ? { backgroundImage: HATCH_CSS } : undefined}
    />
  );
}

export function TimelineTooltip({ active, payload, timezone }: { active?: boolean; payload?: Array<{ payload: Row }>; timezone: string }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const lines: Array<[SwatchKind, string, string]> = [
    ["home", "Home use", kwh(row.load)],
    ...(row.band ? [["range", "Expected range", `${row.band[0].toFixed(1)} to ${row.band[1].toFixed(1)} kWh`] as [SwatchKind, string, string]] : []),
    ["solar", "Solar", kwh(row.solar)],
  ];
  return (
    <div className="bg-popover text-popover-foreground grid gap-1 rounded-lg px-3 py-2 text-sm shadow-md ring-1 ring-foreground/10">
      <p className="font-medium">{hourLabel(row.t, timezone)}</p>
      {lines.map(([kind, k, v]) => (
        <p key={kind} className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground flex items-center gap-2">
            <Swatch kind={kind} />
            {k}
          </span>
          <span className="reading">{v}</span>
        </p>
      ))}
    </div>
  );
}

function Legend() {
  const items: Array<[SwatchKind, string]> = [
    ["home", "Home use"],
    ["range", "Expected range for home use"],
    ["solar", "Solar"],
    ["peak", "Peak price hours"],
  ];
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-2 text-sm">
      {items.map(([kind, label]) => (
        <li key={kind} className="flex items-center gap-2">
          <Swatch kind={kind} />
          {label}
        </li>
      ))}
    </ul>
  );
}

export function TimelineChart({ timeline, timezone }: { timeline: DashboardData["timeline"]; timezone: string }) {
  const firstForecast = timeline.findIndex((r) => r.kind === "forecast");
  // Two home-use series so the line is solid up to Now and dashed after; the last actual hour joins both.
  const rows = timeline.map((r, i) => ({
    t: Date.parse(r.hour),
    period: r.period,
    load: r.loadWh / 1000,
    loadActual: firstForecast < 0 || i < firstForecast ? r.loadWh / 1000 : undefined,
    loadForecast: firstForecast >= 0 && i >= firstForecast - 1 ? r.loadWh / 1000 : undefined,
    solar: r.solarWh / 1000,
    band: r.loadP10Wh != null && r.loadP90Wh != null ? ([r.loadP10Wh / 1000, r.loadP90Wh / 1000] as [number, number]) : undefined,
  }));
  const now = firstForecast >= 0 ? rows[firstForecast]?.t : undefined;
  // contiguous peak runs, each hour spans [t, t + 1 h]
  const peaks: Array<[number, number]> = [];
  for (const r of rows) {
    const last = peaks[peaks.length - 1];
    if (r.period !== "peak") continue;
    if (last?.[1] === r.t) last[1] = r.t + 3_600_000;
    else peaks.push([r.t, r.t + 3_600_000]);
  }
  const ticks = rows.filter((r) => localHour(r.t, timezone) % 6 === 0).map((r) => r.t);
  return (
    <div className="flex flex-col gap-3">
    <ChartContainer config={timelineConfig} className="aspect-auto h-72 w-full">
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <pattern id="range-hatch" width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={5} stroke="var(--chart-3)" strokeWidth={1.5} strokeOpacity={0.7} />
          </pattern>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={ticks} tickFormatter={(v: number) => hourLabel(v, timezone)} tickLine={false} axisLine={false} />
        <YAxis width={40} tickLine={false} axisLine={false} label={{ value: "kWh", angle: -90, position: "insideLeft", fill: "var(--muted-foreground)", fontSize: 12 }} />
        {peaks.map(([x1, x2]) => (
          <ReferenceArea key={x1} x1={x1} x2={x2} fill="var(--muted)" fillOpacity={0.7} ifOverflow="hidden" />
        ))}
        {now != null && (
          <ReferenceLine x={now} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "Now", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 12 }} />
        )}
        <ChartTooltip content={<TimelineTooltip timezone={timezone} />} />
        <Area dataKey="band" type="monotone" stroke="none" fill="url(#range-hatch)" isAnimationActive={false} />
        <Area dataKey="solar" type="monotone" stroke="var(--color-solar)" strokeWidth={2} fill="var(--color-solar)" fillOpacity={0.35} dot={false} isAnimationActive={false} />
        <Line dataKey="loadActual" type="monotone" stroke="var(--color-home)" strokeWidth={2.5} dot={false} activeDot={false} isAnimationActive={false} />
        <Line dataKey="loadForecast" type="monotone" stroke="var(--color-home)" strokeWidth={2.5} strokeDasharray="6 5" dot={false} activeDot={false} isAnimationActive={false} />
      </ComposedChart>
    </ChartContainer>
    <Legend />
    <p className="text-muted-foreground text-sm">
      Hours after Now are a forecast. The hatched band shows where home use will most likely land.
    </p>
    </div>
  );
}

const weekConfig = {
  solarKwh: { label: "Solar (kWh)", color: "var(--color-solar)" },
  loadKwh: { label: "Home use (kWh)", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function WeekChart({ days }: { days: DashboardData["last7Days"] }) {
  const rows = days.map((d) => ({
    day: new Date(`${d.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    solarKwh: d.solarWh / 1000,
    loadKwh: d.loadWh / 1000,
  }));
  return (
    <ChartContainer config={weekConfig} className="aspect-auto h-44 w-full">
      <BarChart data={rows} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} />
        <YAxis width={32} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="solarKwh" fill="var(--color-solar)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="loadKwh" fill="var(--color-home)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  );
}
