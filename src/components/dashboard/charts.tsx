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
  load: { label: "Home use (kWh)", color: "var(--chart-3)" },
  solar: { label: "Solar (kWh)", color: "var(--chart-1)" },
  band: { label: "Home use range, p10 to p90 (kWh)", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function TimelineChart({ timeline, timezone }: { timeline: DashboardData["timeline"]; timezone: string }) {
  const rows = timeline.map((r) => ({
    t: Date.parse(r.hour),
    period: r.period,
    load: r.loadWh / 1000,
    solar: r.solarWh / 1000,
    band: r.loadP10Wh != null && r.loadP90Wh != null ? [r.loadP10Wh / 1000, r.loadP90Wh / 1000] : undefined,
  }));
  const firstForecast = timeline.findIndex((r) => r.kind === "forecast");
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
    <ChartContainer config={timelineConfig} className="aspect-auto h-72 w-full">
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={ticks} tickFormatter={(v: number) => hourLabel(v, timezone)} tickLine={false} axisLine={false} />
        <YAxis width={28} tickLine={false} axisLine={false} />
        {peaks.map(([x1, x2]) => (
          <ReferenceArea key={x1} x1={x1} x2={x2} fill="var(--muted)" fillOpacity={0.7} ifOverflow="hidden" />
        ))}
        {now != null && (
          <ReferenceLine x={now} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "Now", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 12 }} />
        )}
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => hourLabel((p[0]?.payload as { t: number }).t, timezone)} />} />
        <Area dataKey="band" type="monotone" stroke="none" fill="var(--color-home)" fillOpacity={0.18} isAnimationActive={false} />
        <Area dataKey="solar" type="monotone" stroke="var(--color-solar)" strokeWidth={2} fill="var(--color-solar)" fillOpacity={0.2} dot={false} isAnimationActive={false} />
        <Line dataKey="load" type="monotone" stroke="var(--color-home)" strokeWidth={2} dot={false} isAnimationActive={false} />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
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
