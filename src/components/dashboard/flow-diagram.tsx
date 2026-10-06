import type { DashboardData } from "~/app/(protected)/home/data";
import { formatKw } from "~/lib/format";

const IDLE_W = 50;
type Pt = readonly [number, number];
const HUB: Pt = [200, 140];
const A = {
  solar: [112, 38],
  home: [288, 38],
  battery: [180, 262],
  grid: [288, 250],
} as const satisfies Record<string, Pt>;

export function batteryState(w: number) {
  return Math.abs(w) < IDLE_W ? "Idle" : w < 0 ? "Charging" : "Discharging";
}
export const gridState = (w: number) => (w < 0 ? "Exporting" : "Importing");

// One line per node, drawn from source to destination so dashes move the way energy flows.
function Flow({ from, to, w, stroke }: { from: Pt; to: Pt; w: number; stroke: string }) {
  const live = Math.abs(w) >= IDLE_W;
  const secs = Math.max(0.5, 2.6 - (Math.abs(w) / 1000) * 0.35); // faster with more kW
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const deg = (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
  return (
    <g className={stroke} opacity={live ? 1 : 0.25}>
      <path
        d={`M${from[0]} ${from[1]}L${to[0]} ${to[1]}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray="6 8"
        className={live ? "motion-safe:[animation:flow_var(--d)_linear_infinite]" : undefined}
        style={{ "--d": `${secs}s` } as React.CSSProperties}
      />
      {live && (
        <polygon
          points="-6,-6 7,0 -6,6"
          fill="currentColor"
          transform={`translate(${mx} ${my}) rotate(${deg})`}
        />
      )}
    </g>
  );
}

const Reading = ({ x, y, anchor, name, w, note }: { x: number; y: number; anchor: "start" | "end"; name: string; w: number; note?: string }) => (
  <g textAnchor={anchor}>
    <text x={x} y={y} className="fill-muted-foreground text-sm">{name}</text>
    <text x={x} y={y + 28} className="reading fill-foreground text-2xl">{formatKw(w)}</text>
    {note && <text x={x} y={y + 52} className="fill-muted-foreground text-sm">{note}</text>}
  </g>
);

export function FlowDiagram({ live }: { live: DashboardData["live"] }) {
  const { solarW, loadW, batteryW, gridW, socPct } = live;
  const bState = batteryState(batteryW);
  const gState = gridState(gridW);
  const label = `Power flow now. Solar ${formatKw(solarW)} generating. Home ${formatKw(loadW)} using. Powerwall ${bState.toLowerCase()}, ${formatKw(batteryW)}, charge ${socPct}%. Grid ${gState.toLowerCase()} ${formatKw(gridW)}.`;
  const r = 25;
  const circ = 2 * Math.PI * r;
  return (
    <svg role="img" aria-label={label} viewBox="0 0 400 300" className="mx-auto w-full max-w-xl">
      <Flow from={A.solar} to={HUB} w={solarW} stroke="text-solar" />
      <Flow from={HUB} to={A.home} w={loadW} stroke="text-home" />
      <Flow from={batteryW > 0 ? A.battery : HUB} to={batteryW > 0 ? HUB : A.battery} w={batteryW} stroke="text-battery" />
      <Flow from={gridW > 0 ? A.grid : HUB} to={gridW > 0 ? HUB : A.grid} w={gridW} stroke={gridW > 0 ? "text-grid-import" : "text-grid-export"} />
      <circle cx={HUB[0]} cy={HUB[1]} r={5} className="fill-foreground" />
      <Reading x={0} y={18} anchor="start" name="Solar" w={solarW} />
      <Reading x={400} y={18} anchor="end" name="Home" w={loadW} />
      <Reading x={0} y={196} anchor="start" name="Powerwall" w={batteryW} note={bState} />
      <Reading x={400} y={196} anchor="end" name="Grid" w={gridW} note={gState} />
      <g transform="translate(152 262)">
        <circle r={r} fill="none" strokeWidth={5} className="stroke-muted" />
        <circle
          r={r}
          fill="none"
          strokeWidth={5}
          strokeLinecap="round"
          className="stroke-battery"
          strokeDasharray={`${(circ * Math.min(100, socPct)) / 100} ${circ}`}
          transform="rotate(-90)"
        />
        <text textAnchor="middle" dy="4" className="reading fill-foreground text-xs">{`${socPct}%`}</text>
      </g>
    </svg>
  );
}
