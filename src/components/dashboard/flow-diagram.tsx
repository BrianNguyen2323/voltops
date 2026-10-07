import {
  ElectricTower01Icon,
  Home01Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

import type { DashboardView } from "~/lib/dashboard";
import { formatKw } from "~/lib/format";

const IDLE_W = 50;
type Pt = readonly [number, number];

// Orthogonal cross: four equal arms (ARM) around the hub, each ending on its node's box edge.
const ARM = 95;
const HUB: Pt = [230, 220];
const BOX = { w: 116, h: 120 };
const CENTRE = {
  solar: [HUB[0], HUB[1] - ARM - BOX.h / 2],
  battery: [HUB[0], HUB[1] + ARM + BOX.h / 2],
  grid: [HUB[0] - ARM - BOX.w / 2, HUB[1]],
  home: [HUB[0] + ARM + BOX.w / 2, HUB[1]],
} as const satisfies Record<string, Pt>;
// Where each arm meets its node.
const EDGE = {
  solar: [HUB[0], HUB[1] - ARM],
  battery: [HUB[0], HUB[1] + ARM],
  grid: [HUB[0] - ARM, HUB[1]],
  home: [HUB[0] + ARM, HUB[1]],
} as const satisfies Record<string, Pt>;

export function batteryState(w: number) {
  return Math.abs(w) < IDLE_W ? "Idle" : w < 0 ? "Charging" : "Discharging";
}
export const gridState = (w: number) => (w < 0 ? "Exporting" : "Importing");

// Drawn source to destination so the dashes move the way energy flows.
function Flow({
  id,
  from,
  to,
  w,
  color,
}: {
  id: string;
  from: Pt;
  to: Pt;
  w: number;
  color: string;
}) {
  const live = Math.abs(w) >= IDLE_W;
  const secs = Math.max(0.5, 2.6 - (Math.abs(w) / 1000) * 0.35); // faster with more kW
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const deg = (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
  return (
    <g className={color} opacity={live ? 1 : 0.25}>
      <line
        data-flow={id}
        x1={from[0]}
        y1={from[1]}
        x2={to[0]}
        y2={to[1]}
        stroke="currentColor"
        strokeWidth={3}
        strokeDasharray="6 8"
        className={
          live
            ? "motion-safe:[animation:flow_var(--d)_linear_infinite]"
            : undefined
        }
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

// One unit: symbol, then name, kW and state directly beneath.
function Node({
  id,
  c,
  name,
  w,
  state,
  symbol,
  color,
}: {
  id: string;
  c: Pt;
  name: string;
  w: number;
  state?: string;
  symbol: React.ReactNode;
  color: string;
}) {
  const [x, y] = c;
  return (
    <g data-node={id} textAnchor="middle">
      <rect
        x={x - BOX.w / 2}
        y={y - BOX.h / 2}
        width={BOX.w}
        height={BOX.h}
        rx={12}
        className="fill-card"
      />
      <g transform={`translate(${x} ${y - 30})`} className={color}>
        {symbol}
      </g>
      <text x={x} y={y + 6} className="fill-muted-foreground text-base">
        {name}
      </text>
      <text
        x={x}
        y={y + 30}
        data-reading="kw"
        className="reading fill-foreground text-lg sm:text-xl"
      >
        {formatKw(w)}
      </text>
      {state && (
        <text x={x} y={y + 49} className="fill-muted-foreground text-base">
          {state}
        </text>
      )}
    </g>
  );
}

const Symbol = ({ icon }: { icon: IconSvgElement }) => (
  <g transform="translate(-12 -12)">
    <HugeiconsIcon icon={icon} size={24} />
  </g>
);

export function FlowDiagram({ live }: { live: DashboardView["live"] }) {
  const { solarW, loadW, batteryW, gridW, socPct } = live;
  const bState = batteryState(batteryW);
  const gState = gridState(gridW);
  const label = `Power flow now. Solar ${formatKw(solarW)} generating. Home ${formatKw(loadW)} using. Powerwall ${bState.toLowerCase()}, ${formatKw(batteryW)}, charge ${socPct}%. Grid ${gState.toLowerCase()} ${formatKw(gridW)}.`;
  const r = 18;
  const circ = 2 * Math.PI * r;
  const out = (w: number, edge: Pt) =>
    (w > 0 ? [edge, HUB] : [HUB, edge]) as [Pt, Pt];
  const [bFrom, bTo] = out(batteryW, EDGE.battery); // discharging flows into the hub
  const [gFrom, gTo] = out(gridW, EDGE.grid); // importing flows into the hub
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 460 440"
      className="mx-auto w-full max-w-xl"
    >
      <Flow
        id="solar"
        from={EDGE.solar}
        to={HUB}
        w={solarW}
        color="text-solar"
      />
      <Flow id="home" from={HUB} to={EDGE.home} w={loadW} color="text-home" />
      <Flow
        id="battery"
        from={bFrom}
        to={bTo}
        w={batteryW}
        color="text-battery"
      />
      <Flow
        id="grid"
        from={gFrom}
        to={gTo}
        w={gridW}
        color={gridW > 0 ? "text-grid-import" : "text-grid-export"}
      />
      <circle cx={HUB[0]} cy={HUB[1]} r={5} className="fill-foreground" />
      <Node
        id="solar"
        c={CENTRE.solar}
        name="Solar"
        w={solarW}
        color="text-solar"
        symbol={<Symbol icon={Sun03Icon} />}
      />
      <Node
        id="grid"
        c={CENTRE.grid}
        name="Grid"
        w={gridW}
        state={gState}
        color={gridW > 0 ? "text-grid-import" : "text-grid-export"}
        symbol={<Symbol icon={ElectricTower01Icon} />}
      />
      <Node
        id="home"
        c={CENTRE.home}
        name="Home"
        w={loadW}
        color="text-home"
        symbol={<Symbol icon={Home01Icon} />}
      />
      <Node
        id="battery"
        c={CENTRE.battery}
        name="Powerwall"
        w={batteryW}
        state={bState}
        color="text-battery"
        symbol={
          <>
            <circle
              r={r}
              fill="none"
              strokeWidth={4}
              className="stroke-muted-foreground/30"
            />
            <circle
              r={r}
              fill="none"
              strokeWidth={4}
              strokeLinecap="round"
              stroke="currentColor"
              strokeDasharray={`${(circ * Math.min(100, socPct)) / 100} ${circ}`}
              transform="rotate(-90)"
            />
            <text
              textAnchor="middle"
              dy="4"
              className="fill-foreground text-[11px] font-bold tabular-nums"
            >{`${socPct}%`}</text>
          </>
        }
      />
    </svg>
  );
}
