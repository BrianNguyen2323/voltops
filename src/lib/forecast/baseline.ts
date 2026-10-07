import { localDate, localParts } from "~/lib/time";

type Hist = { hour: number; solarWh: number; loadWh: number };
type Ghi = { hour: number; ghiWm2: number };

export type ForecastInput = {
  hours: number[];
  tz: string;
  history: Hist[];
  observedGhi: Ghi[];
  forecastGhi: Ghi[];
  startSocPct: number;
  capacityWh: number;
  reservePct: number;
};

/** Nearest-rank percentile of an ascending-sorted array. */
const q = (s: number[], p: number) => s[Math.ceil((p / 100) * s.length) - 1]!;
const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

export function forecastHours(input: ForecastInput) {
  const { hours, tz, history, startSocPct, capacityWh, reservePct } = input;
  const hod = (ms: number) => localParts(ms, tz).hour;
  const obs = new Map(input.observedGhi.map((g) => [g.hour, g.ghiWm2]));
  const fc = new Map(input.forecastGhi.map((g) => [g.hour, g.ghiWm2]));

  // history hours with observed ghi > 0
  const used = history.flatMap((h) => {
    const ghi = obs.get(h.hour) ?? 0;
    return ghi > 0 ? [{ ...h, ghi, hod: hod(h.hour), day: localDate(h.hour, tz) }] : [];
  });
  const kOf = (hs: typeof used) => {
    const g = hs.reduce((s, h) => s + h.ghi, 0);
    return g > 0 ? hs.reduce((s, h) => s + h.solarWh, 0) / g : undefined;
  };
  const kAll = kOf(used);
  const kByHod = new Map<number, number>();
  for (const x of new Set(used.map((h) => h.hod))) kByHod.set(x, kOf(used.filter((h) => h.hod === x))!);
  const kFor = (x: number) => kByHod.get(x) ?? kAll;

  // per-day actual / predicted ratios, each history hour using its own k
  const days = new Map<string, { actual: number; pred: number }>();
  for (const h of used) {
    const d = days.get(h.day) ?? { actual: 0, pred: 0 };
    d.actual += h.solarWh;
    d.pred += kFor(h.hod)! * h.ghi;
    days.set(h.day, d);
  }
  const ratios = sorted([...days.values()].filter((d) => d.pred > 0).map((d) => d.actual / d.pred));

  let energy = (startSocPct / 100) * capacityWh;
  return hours.map((hour) => {
    const x = hod(hour);
    const same = history.filter((h) => hod(h.hour) === x);
    const dist = (f: (h: Hist) => number): [number, number, number] => {
      const s = sorted(same.map(f));
      return s.length ? [q(s, 50), q(s, 10), q(s, 90)] : [0, 0, 0];
    };
    const [loadWh, loadP10Wh, loadP90Wh] = dist((h) => h.loadWh);

    let [solarWh, solarP10Wh, solarP90Wh] = dist((h) => h.solarWh);
    const k = kFor(x);
    const g = fc.get(hour);
    if (k !== undefined && g !== undefined) {
      solarWh = Math.round(k * g);
      if (ratios.length) {
        solarP10Wh = Math.min(solarWh, Math.round(solarWh * q(ratios, 10)));
        solarP90Wh = Math.max(solarWh, Math.round(solarWh * q(ratios, 90)));
      } else solarP10Wh = solarP90Wh = solarWh;
    }

    const socPct = Math.min(100, Math.max(0, Math.round((energy / capacityWh) * 100)));
    // ponytail: no inverter power cap
    const net = solarWh - loadWh;
    if (net > 0) energy += Math.min(net, capacityWh - energy);
    else energy -= Math.min(-net, Math.max(0, energy - (reservePct / 100) * capacityWh));

    return { hour: new Date(hour).toISOString(), loadWh, loadP10Wh, loadP90Wh, solarWh, solarP10Wh, solarP90Wh, socPct };
  });
}
