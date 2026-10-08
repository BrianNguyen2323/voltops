import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkSnapshot } from "~/lib/dashboard";
import type { LiveSample } from "~/lib/core/types";
import { addDays, localDate, localMidnight } from "~/lib/time";
import { costToday, parseTariff, tariffAt } from "~/lib/tariff";
import { buildSnapshot, type BuildInput } from "./build";

// Signature under test (see handoff):
//   buildSnapshot(input: BuildInput): DashboardSnapshot   (pure, no I/O)
// BuildInput = {
//   now: number; source: "fleet-api"|"local-gateway"|"replay";
//   site: { name, timezone, temperatureUnit, latitude, longitude, usableCapacityWh, backupReservePct } (each nullable);
//   currency: string | null; tariff: Tariff | null;
//   live: LiveSample; liveUnavailable: boolean;
//   lastSampleTs: number | null;
//   hourly: HourRow[];          // energy_intervals summed per UTC hour: today + the 7 days before
//   samples: { ts: number; socPct: number }[];
//   observed: { hour: number; ghiWm2: number }[];
//   forecast: { hour, tempC, cloudPct, ghiWm2, precipProbPct }[]   // latest-issued row per target hour
//   peakEstimate: { historyDays: number; today: PeakHistory | null; tomorrow: PeakHistory | null }
//     // B016: computed by load.ts (B015 queries); buildSnapshot copies it to the snapshot and
//     // derives `recommendation` from it with reserveRecommendation() (src/lib/advisor/reserve.ts).
// }

const HOUR = 3_600_000;
const TZ = "America/Los_Angeles";
const tariff = parseTariff(
  (
    JSON.parse(readFileSync("fixtures/fleet-api/site_info.json", "utf8")) as {
      response: { tariff_content: unknown };
    }
  ).response.tariff_content,
);

// Balanced by construction: solar + 0 + gi = load + 0 + ge.
const hourRow = (start: number) => {
  const local = (new Date(start).getUTCHours() + 17) % 24;
  const solarWh =
    local >= 7 && local <= 18
      ? Math.round(3000 * Math.sin((Math.PI * (local - 6)) / 13))
      : 0;
  const loadWh =
    600 + 40 * (local % 7) + (local >= 16 && local <= 21 ? 900 : 0);
  return {
    start,
    solarWh,
    loadWh,
    gridImportWh: Math.max(0, loadWh - solarWh),
    gridExportWh: Math.max(0, solarWh - loadWh),
    batteryChargeWh: 0,
    batteryDischargeWh: 0,
  };
};
const hours = (from: number, toExcl: number) => {
  const out = [];
  for (let t = from; t < toExcl; t += HOUR) out.push(hourRow(t));
  return out;
};

const live = (now: number): LiveSample => ({
  ts: new Date(now).toISOString(),
  solarW: 3000,
  loadW: 1000,
  batteryW: -1500,
  gridW: -500,
  socPct: 63.6,
  gridStatus: "connected",
});

type Opts = {
  daysBefore?: number; // full days of history before today
  dataUntil?: number; // last interval start (inclusive); default: the last full hour before now
  tariff?: boolean;
  weather?: boolean;
  location?: boolean;
  liveUnavailable?: boolean;
  peakEstimate?: BuildInput["peakEstimate"];
};

function input(now: number, o: Opts = {}): BuildInput {
  const today = localDate(now, TZ);
  const start = localMidnight(addDays(today, -(o.daysBefore ?? 7)), TZ);
  const end = localMidnight(addDays(today, 2), TZ);
  const lastFull = Math.floor(now / HOUR) * HOUR - HOUR;
  const hourly = hours(start, (o.dataUntil ?? lastFull) + HOUR);
  const weather = o.weather ?? true;
  const tomorrow0 = localMidnight(addDays(today, 1), TZ);
  const tomorrow1 = localMidnight(addDays(today, 2), TZ);
  const forecast = [];
  if (weather)
    for (let t = Math.ceil(now / HOUR) * HOUR; t < end; t += HOUR) {
      const inTomorrow = t >= tomorrow0 && t < tomorrow1;
      forecast.push({
        hour: t,
        tempC: inTomorrow ? 10 + (((t - tomorrow0) / HOUR) % 13) : 15,
        cloudPct: 20,
        ghiWm2: 500,
        precipProbPct: inTomorrow ? 10 : 0,
      });
    }
  return {
    now,
    source: "fleet-api",
    site: {
      name: "Home",
      timezone: TZ,
      temperatureUnit: "C",
      latitude: (o.location ?? true) ? 34 : null,
      longitude: (o.location ?? true) ? -118 : null,
      usableCapacityWh: 13500,
      backupReservePct: 20,
    },
    currency: "USD",
    tariff: (o.tariff ?? true) ? tariff : null,
    live: live(now),
    liveUnavailable: o.liveUnavailable ?? false,
    lastSampleTs: now - 60_000,
    hourly,
    samples: [],
    observed: weather
      ? hourly.map((h) => ({ hour: h.start, ghiWm2: h.solarWh / 5 }))
      : [],
    forecast,
    peakEstimate: o.peakEstimate ?? {
      historyDays: 0,
      today: null,
      tomorrow: null,
    },
  };
}

const NORMAL = Date.parse("2026-05-20T19:30:00Z"); // 12:30 PDT
const SPRING = Date.parse("2026-03-08T20:00:00Z");
const FALL = Date.parse("2026-11-01T20:00:00Z");

describe("buildSnapshot", () => {
  it("normal day passes checkSnapshot with no warnings", () => {
    const s = buildSnapshot(input(NORMAL));
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.health.warnings).toEqual([]);
    expect(s.timeline).toHaveLength(48);
    expect(s.recommendation).toBeNull();
    expect(s.accuracy).toEqual([]);
    expect(s.source).toBe("fleet-api");
    expect(s.currency).toBe("USD");
    expect(s.updatedAt).toBe(new Date(NORMAL).toISOString());
    expect(s.health.estRequestsPerMonth).toBe(1440);
  });

  it.each([
    ["2026-03-08 (spring forward)", SPRING, 47],
    ["2026-11-01 (fall back)", FALL, 49],
  ])("%s has %i rows and passes checkSnapshot", (_n, now, rows) => {
    const s = buildSnapshot(input(now));
    expect(s.timeline).toHaveLength(rows);
    expect(checkSnapshot(s)).toEqual([]);
  });

  it("splits actual (hour < updatedAt) from forecast, rounding soc", () => {
    const s = buildSnapshot(input(NORMAL));
    for (const r of s.timeline)
      expect(r.kind).toBe(Date.parse(r.hour) < NORMAL ? "actual" : "forecast");
    expect(s.live.socPct).toBe(64);
    expect(s.live.usableCapacityWh).toBe(13500);
    const f = s.timeline.find((r) => r.kind === "forecast")!;
    expect(f.loadP10Wh).toBeDefined();
    expect(f.gridImportWh).toBeUndefined();
  });

  it("actual rows carry the seeded sums; missing hours are zeros", () => {
    const o = input(NORMAL, { dataUntil: NORMAL - 5 * HOUR });
    const s = buildSnapshot(o);
    const mid = localMidnight(localDate(NORMAL, TZ), TZ);
    const seeded = s.timeline.find(
      (r) => Date.parse(r.hour) === mid + 5 * HOUR,
    )!;
    const { start, ...sums } = hourRow(mid + 5 * HOUR);
    expect(start).toBe(mid + 5 * HOUR);
    expect(seeded).toMatchObject({ kind: "actual", ...sums });
    const missing = s.timeline.find(
      (r) => Date.parse(r.hour) === Math.floor(NORMAL / HOUR) * HOUR - HOUR,
    )!;
    expect(missing).toMatchObject({
      kind: "actual",
      solarWh: 0,
      loadWh: 0,
      gridImportWh: 0,
      gridExportWh: 0,
      batteryChargeWh: 0,
      batteryDischargeWh: 0,
    });
  });

  it("actual socPct is the sample nearest the hour start, else live", () => {
    const o = input(NORMAL);
    const mid = localMidnight(localDate(NORMAL, TZ), TZ);
    o.samples = [
      { ts: mid + 3 * HOUR + 2 * 60_000, socPct: 55.4 },
      { ts: mid + 3 * HOUR - 40 * 60_000, socPct: 90 },
    ];
    const s = buildSnapshot(o);
    const at = (h: number) =>
      s.timeline.find((r) => Date.parse(r.hour) === mid + h * HOUR)!;
    expect(at(3).socPct).toBe(55);
    expect(at(10).socPct).toBe(64);
  });

  it("period per row is tariffAt(hour); costToday import equals actual import", () => {
    const s = buildSnapshot(input(NORMAL));
    for (const r of s.timeline)
      expect(r.period).toBe(tariffAt(tariff!, Date.parse(r.hour), TZ).period);
    const todayActual = s.timeline.filter(
      (r) =>
        r.kind === "actual" &&
        localDate(Date.parse(r.hour), TZ) === "2026-05-20",
    );
    const imp = todayActual.reduce((a, r) => a + (r.gridImportWh ?? 0), 0);
    expect(s.costToday.periods.reduce((a, p) => a + p.importWh, 0)).toBe(imp);
    expect(s.costToday).toEqual(
      costToday(
        tariff!,
        todayActual.map((r) => ({
          hour: r.hour,
          gridImportWh: r.gridImportWh!,
          gridExportWh: r.gridExportWh!,
        })),
        TZ,
      ),
    );
    expect(s.tariffNow).toEqual(tariffAt(tariff!, NORMAL, TZ));
  });

  it("previousDays are the 6 local dates before today, oldest first, with summed energy", () => {
    const s = buildSnapshot(input(NORMAL));
    expect(s.previousDays.map((d) => d.date)).toEqual([
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
      "2026-05-17",
      "2026-05-18",
      "2026-05-19",
    ]);
    const expected = hours(
      localMidnight("2026-05-19", TZ),
      localMidnight("2026-05-20", TZ),
    );
    expect(s.previousDays[5]).toEqual({
      date: "2026-05-19",
      solarWh: expected.reduce((a, r) => a + r.solarWh, 0),
      loadWh: expected.reduce((a, r) => a + r.loadWh, 0),
    });
  });

  it("no tariff: off-peak everywhere, zero rates, 3 zero-cost periods, warning", () => {
    const s = buildSnapshot(input(NORMAL, { tariff: false }));
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.timeline.every((r) => r.period === "off-peak")).toBe(true);
    expect(s.tariffNow).toEqual({
      period: "off-peak",
      importCentsPerKwh: 0,
      exportCentsPerKwh: 0,
      endsAt: new Date(localMidnight("2026-05-21", TZ)).toISOString(),
    });
    expect(s.costToday.periods.map((p) => p.period)).toEqual([
      "off-peak",
      "mid-peak",
      "peak",
    ]);
    expect(s.costToday.periods.every((p) => p.costCents === 0)).toBe(true);
    expect(s.costToday.exportCreditCents).toBe(0);
    expect(s.costToday.netCents).toBe(0);
    expect(s.health.warnings).toEqual(["No tariff from Tesla"]);
  });

  it("no weather: weatherTomorrow null, location warning when lat/lon missing", () => {
    const s = buildSnapshot(input(NORMAL, { weather: false, location: false }));
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.weatherTomorrow).toBeNull();
    expect(s.health.warnings).toEqual([
      "Set SITE_LATITUDE and SITE_LONGITUDE for weather",
    ]);
  });

  it("weatherTomorrow: high/low, mean cloud, max precip chance, condition", () => {
    const wx = (cloud: number, prob: number) => {
      const o = input(NORMAL);
      o.forecast = o.forecast.map((f, i) => ({
        ...f,
        cloudPct: cloud,
        precipProbPct: i === 0 ? 0 : prob,
      }));
      return buildSnapshot(o).weatherTomorrow!;
    };
    expect(wx(20, 10)).toMatchObject({
      date: "2026-05-21",
      condition: "clear",
      highC: 22,
      lowC: 10,
      cloudCoverPct: 20,
      precipitationChancePct: 10,
    });
    expect(wx(24, 0).condition).toBe("clear");
    expect(wx(25, 0).condition).toBe("partly-cloudy");
    expect(wx(69, 0).condition).toBe("partly-cloudy");
    expect(wx(70, 0).condition).toBe("cloudy");
    expect(wx(10, 49).condition).toBe("clear");
    expect(wx(90, 50).condition).toBe("rain");
  });

  it("site defaults when fields are null", () => {
    const o = input(NORMAL);
    o.site = {
      name: null,
      timezone: null,
      temperatureUnit: null,
      latitude: null,
      longitude: null,
      usableCapacityWh: null,
      backupReservePct: null,
    };
    o.currency = null;
    const s = buildSnapshot(o);
    expect(s.site).toEqual({
      name: "My home",
      timezone: "UTC",
      temperatureUnit: "F",
    });
    expect(s.currency).toBe("USD");
    expect(s.live.usableCapacityWh).toBe(13500);
  });

  it("live unavailable adds the warning; lastPollAt is the last sample, else updatedAt", () => {
    const s = buildSnapshot(input(NORMAL, { liveUnavailable: true }));
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.health.warnings).toEqual([
      "Live reading unavailable: showing the last stored reading",
    ]);
    expect(s.health.lastPollAt).toBe(new Date(NORMAL - 60_000).toISOString());
    const o = input(NORMAL);
    o.lastSampleTs = null;
    expect(buildSnapshot(o).health.lastPollAt).toBe(s.updatedAt);
  });

  it("cold start (1 day of history) shows the learning warning and passes checkSnapshot", () => {
    const s = buildSnapshot(input(NORMAL, { daysBefore: 1 }));
    expect(checkSnapshot(s)).toEqual([]);
    expect(s.health.warnings).toEqual([
      "Learning: forecasts improve after 7 days of data",
    ]);
  });

  it("history more than 2 h behind warns with floor hours", () => {
    const s = buildSnapshot(
      input(NORMAL, { dataUntil: Date.parse("2026-05-20T14:00:00Z") }),
    );
    expect(s.health.warnings).toEqual(["Energy history is 5 h behind"]);
    const edge = buildSnapshot(
      input(NORMAL, { dataUntil: Date.parse("2026-05-20T17:00:00Z") }),
    );
    expect(edge.health.warnings).toEqual(["Energy history is 2 h behind"]);
  });

  it("history lag is measured from latestIntervalStart: 1 h 55 min none, 2 h 30 min warns", () => {
    const at = (iso: string) => Date.parse(iso);
    // hour bucket 09:00 would say 3 h; the interval start 10:00 says 2 h 30 min.
    const behind = buildSnapshot({
      ...input(at("2026-05-20T12:30:00Z"), {
        dataUntil: at("2026-05-20T09:00:00Z"),
      }),
      latestIntervalStart: at("2026-05-20T10:00:00Z"),
    });
    expect(behind.health.warnings).toEqual(["Energy history is 2 h behind"]);
    // hour bucket 10:00 would say 2 h 50 min; the interval start 10:55 says 1 h 55 min.
    const fine = buildSnapshot({
      ...input(at("2026-05-20T12:50:00Z"), {
        dataUntil: at("2026-05-20T10:00:00Z"),
      }),
      latestIntervalStart: at("2026-05-20T10:55:00Z"),
    });
    expect(fine.health.warnings).toEqual([]);
  });

  describe("peakEstimate and recommendation", () => {
    const ph = (
      avg: number,
      similarDays = 7,
      similarAvg: number | null = avg,
    ) => ({
      historyAvgWh: avg,
      highC: 22,
      similarTempDays: similarDays,
      similarTempAvgWh: similarAvg,
    });
    const days = (
      historyDays: number,
      tomorrow: ReturnType<typeof ph> | null,
    ) => ({
      historyDays,
      today: ph(9000),
      tomorrow,
    });

    it("copies peakEstimate through; the default stub gives no recommendation", () => {
      const s = buildSnapshot(input(NORMAL));
      expect(s.peakEstimate).toEqual({
        historyDays: 0,
        today: null,
        tomorrow: null,
      });
      expect(s.recommendation).toBeNull();
    });

    it("historyDays >= 7 and tomorrow set: recommendation with reservePlan, valid until 21:00 tomorrow", () => {
      const pe = days(7, ph(11000));
      const s = buildSnapshot(input(NORMAL, { peakEstimate: pe }));
      expect(checkSnapshot(s)).toEqual([]);
      expect(s.peakEstimate).toEqual(pe);
      const r = s.recommendation!;
      expect(r.reserve).toEqual({
        emergencyPct: 20,
        extraPct: 80, // ceil(11000 * 100 / 13500) = 82, capped at 100 - 20
        targetPct: 100,
        peakWh: 11000,
        coveredWh: 10800, // floor(80 * 13500 / 100)
      });
      expect(r.action).toBe("Raise backup reserve to 100%");
      expect(r.effectWh).toBe(10800);
      expect(r.validFrom).toBe("2026-05-21T04:00:00.000Z"); // today's peak ends 21:00 PDT, after updatedAt
      expect(r.validTo).toBe("2026-05-22T04:00:00.000Z"); // tomorrow 21:00 PDT
      expect(r.confidence).toBe("medium");
      expect(r.why).toEqual([
        "Usual peak use: 11.0 kWh over 7 days",
        "On days near 22°C: 11.0 kWh over 7 days",
        "Tomorrow's forecast high: 22°C",
      ]);
    });

    it("historyDays 6: peakEstimate kept, recommendation null", () => {
      const pe = { ...days(6, ph(11000, 3)), today: ph(9000, 3) };
      const s = buildSnapshot(input(NORMAL, { peakEstimate: pe }));
      expect(checkSnapshot(s)).toEqual([]);
      expect(s.peakEstimate).toEqual(pe);
      expect(s.recommendation).toBeNull();
    });

    it("tomorrow null with enough history: recommendation null", () => {
      const s = buildSnapshot(input(NORMAL, { peakEstimate: days(30, null) }));
      expect(checkSnapshot(s)).toEqual([]);
      expect(s.recommendation).toBeNull();
    });

    it("uses the site's usable capacity and unit (F)", () => {
      const o = input(NORMAL, { peakEstimate: days(7, ph(5000, 2, null)) });
      o.site.temperatureUnit = "F";
      o.site.usableCapacityWh = 27000;
      const s = buildSnapshot(o);
      expect(checkSnapshot(s)).toEqual([]);
      expect(s.recommendation?.reserve).toMatchObject({
        extraPct: 19,
        targetPct: 39,
        coveredWh: 5000,
      });
      expect(s.recommendation?.confidence).toBe("low");
      expect(s.recommendation?.why).toEqual([
        "Usual peak use: 5.0 kWh over 7 days",
        "Not enough days near 72°F yet (2 so far)",
        "Tomorrow's forecast high: 72°F",
      ]);
    });
  });

  it("warnings come in the documented order", () => {
    const s = buildSnapshot(
      input(NORMAL, {
        daysBefore: 1,
        dataUntil: Date.parse("2026-05-20T14:00:00Z"),
        location: false,
        liveUnavailable: true,
        tariff: false,
      }),
    );
    expect(s.health.warnings).toEqual([
      "Energy history is 5 h behind",
      "Learning: forecasts improve after 7 days of data",
      "Set SITE_LATITUDE and SITE_LONGITUDE for weather",
      "Live reading unavailable: showing the last stored reading",
      "No tariff from Tesla",
    ]);
  });
});
