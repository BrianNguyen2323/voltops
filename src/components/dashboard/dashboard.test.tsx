import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { sampleSnapshot } from "~/app/(protected)/home/data";
import { TimelineTooltip } from "~/components/dashboard/charts";
import { Dashboard } from "~/components/dashboard/dashboard";
import {
  reservePlan,
  toDashboardView,
  type DashboardSnapshot,
  type DashboardView,
} from "~/lib/dashboard";
import { formatKw, formatKwh, formatMoney, formatTemp } from "~/lib/format";

type Props = {
  view?: DashboardView;
  connected?: boolean;
  isSample?: boolean;
  showLogout?: boolean;
};

const sampleDashboard = toDashboardView(sampleSnapshot);

const render = ({
  view = sampleDashboard,
  connected = true,
  isSample = true,
  showLogout = true,
}: Props = {}) =>
  renderToStaticMarkup(
    <Dashboard
      view={view}
      connected={connected}
      isSample={isSample}
      showLogout={showLogout}
    />,
  );

const withLive = (live: Partial<DashboardView["live"]>): DashboardView => ({
  ...sampleDashboard,
  live: { ...sampleDashboard.live, ...live },
});

// Visible text: drop tags and React's text-node separators, decode &amp;.
const text = (html: string) =>
  html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

const h2s = (html: string) =>
  [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) =>
    text(m[1] ?? "").trim(),
  );

const hero = (html: string) => {
  const start = html.indexOf("Right now");
  const end = html.indexOf("Tonight", start);
  return html.slice(start, end);
};

const { live, today, costToday, currency, recommendation } = sampleDashboard;

describe("Dashboard structure", () => {
  const html = render();

  it("has the site name as the only h1", () => {
    const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) =>
      text(m[1] ?? "").trim(),
    );
    expect(h1).toEqual([sampleDashboard.site.name]);
  });

  it("renders the seven h2 sections in order", () => {
    expect(h2s(html)).toEqual([
      "Right now",
      "Tonight",
      "Today and tomorrow",
      "Today so far",
      "Cost today",
      "Last 7 days",
      "Forecast accuracy",
    ]);
  });

  it("shows the updated time in the site timezone", () => {
    // 2026-07-16T00:00:00Z is 5:00 PM in America/Los_Angeles.
    expect(text(html)).toMatch(/Updated 5:00\s?PM/);
  });
});

describe("Dashboard header flags", () => {
  it("shows Sample data only when isSample", () => {
    expect(text(render({ isSample: true }))).toContain("Sample data");
    expect(text(render({ isSample: false }))).not.toContain("Sample data");
  });

  it("shows the Connect Tesla banner only when not connected", () => {
    const off = render({ connected: false });
    expect(text(off)).toContain(
      "Connect your Tesla account to see your own system",
    );
    expect(text(off)).toContain("Connect Tesla");
    expect(off).toContain('href="/api/auth/tesla"');
    // sections still render
    expect(h2s(off)).toHaveLength(7);

    const on = render({ connected: true });
    expect(text(on)).not.toContain("Connect Tesla");
    expect(on).not.toContain("/api/auth/tesla");
  });

  it("toggles Log out with showLogout", () => {
    expect(text(render({ showLogout: true }))).toContain("Log out");
    expect(text(render({ showLogout: false }))).not.toContain("Log out");
  });
});

describe("Right now hero", () => {
  const html = render();
  const h = hero(html);
  const t = text(h);

  it("shows solar, home kW and the SoC percentage", () => {
    expect(t).toContain(formatKw(live.solarW));
    expect(t).toContain(formatKw(live.loadW));
    expect(t).toContain(`${live.socPct}%`);
  });

  it("shows grid kW with a direction word and no minus signs", () => {
    expect(t).toContain(formatKw(live.gridW));
    expect(t).toMatch(live.gridW < 0 ? /\bExporting\b/ : /\bImporting\b/);
    expect(t).not.toMatch(/[-−]\s?\d/);
  });

  it("shows Idle for a battery under 50 W (the sample)", () => {
    expect(Math.abs(live.batteryW)).toBeLessThan(50);
    expect(t).toMatch(/\bIdle\b/);
    expect(t).not.toMatch(/\b(Dis)?[Cc]harging\b/);
  });

  it("shows Charging, Discharging and Importing for the matching signs", () => {
    const charging = text(
      hero(render({ view: withLive({ batteryW: -1500 }) })),
    );
    expect(charging).toMatch(/\bCharging\b/);
    expect(charging).not.toMatch(/\bIdle\b/);
    expect(charging).toContain(formatKw(1500));
    expect(charging).not.toMatch(/[-−]\s?\d/);

    const discharging = text(
      hero(render({ view: withLive({ batteryW: 1500 }) })),
    );
    expect(discharging).toMatch(/\bDischarging\b/);
    expect(discharging).not.toMatch(/\bIdle\b/);

    const importing = text(hero(render({ view: withLive({ gridW: 2000 }) })));
    expect(importing).toMatch(/\bImporting\b/);
    expect(importing).not.toMatch(/\bExporting\b/);
  });

  it("treats 50 W as discharging and 49 W as idle", () => {
    expect(text(hero(render({ view: withLive({ batteryW: 50 }) })))).toMatch(
      /\bDischarging\b/,
    );
    expect(text(hero(render({ view: withLive({ batteryW: -49 }) })))).toMatch(
      /\bIdle\b/,
    );
  });

  it("has an svg role=img with a non-empty aria-label naming the flows", () => {
    const m = /<svg[^>]*role="img"[^>]*>/.exec(h);
    expect(m).not.toBeNull();
    const label = /aria-label="([^"]*)"/.exec(m?.[0] ?? "")?.[1] ?? "";
    expect(label.trim().length).toBeGreaterThan(0);
    for (const word of ["Solar", "Home", "Powerwall", "Grid"])
      expect(label).toContain(word);
  });

  it("shows the tariff chip with period and import price", () => {
    expect(t).toContain("Peak");
    expect(t).toContain(
      formatMoney(sampleDashboard.tariffNow.importCentsPerKwh, currency),
    );
    expect(t).toContain("/kWh");
  });

  it("limits ambient motion to motion-safe", () => {
    expect(h).toMatch(/motion-reduce|motion-safe/);
  });
});

describe("Tonight panel", () => {
  it("shows the recommendation details", () => {
    if (!recommendation) throw new Error("sample needs a recommendation");
    const t = text(render());
    for (const line of recommendation.why) expect(t).toContain(line);
    expect(t).toContain(recommendation.wouldChange);
    expect(t).toContain(formatKwh(recommendation.effectWh));
    expect(t).toContain(formatMoney(recommendation.savingsCents, currency));
    expect(t.toLowerCase()).toContain(recommendation.confidence);
  });

  it("shows the empty state when recommendation is null", () => {
    const t = text(
      render({ view: { ...sampleDashboard, recommendation: null } }),
    );
    expect(t).toContain("No changes needed tonight.");
    expect(t).not.toContain("Raise backup reserve");
  });

  it("does not show the empty state when there is a recommendation", () => {
    expect(text(render())).not.toContain("No changes needed tonight.");
  });
});

describe("Totals, cost, accuracy and status", () => {
  const t = text(render());

  it("shows today's totals", () => {
    for (const wh of [
      today.solarWh,
      today.loadWh,
      today.gridImportWh,
      today.gridExportWh,
      today.batteryChargeWh,
      today.batteryDischargeWh,
    ])
      expect(t).toContain(formatKwh(wh));
    expect(t).toContain(`${today.selfPoweredPct}%`);
  });

  it("shows cost per period, export credit and net", () => {
    for (const p of costToday.periods)
      expect(t).toContain(formatMoney(p.costCents, currency));
    expect(t).toContain(formatMoney(costToday.exportCreditCents, currency));
    expect(costToday.netCents).toBeLessThan(0);
  });

  it("shows accuracy errors and the measuring window", () => {
    for (const a of sampleDashboard.accuracy) {
      expect(t).toContain(`${a.maePct}%`);
      expect(t).toContain(`${a.baselineMaePct}%`);
      expect(t).toContain(`${a.days} days`);
    }
  });

  it("shows the system status line with source name and request estimate", () => {
    expect(t).toContain("Tesla Fleet API");
    expect(t).toMatch(/~\s?8,?640 requests\/month/);
  });

  it("shows warnings when present", () => {
    const warned = text(
      render({
        view: {
          ...sampleDashboard,
          health: {
            ...sampleDashboard.health,
            warnings: ["Poll failed twice"],
          },
        },
      }),
    );
    expect(warned).toContain("Poll failed twice");
    expect(t).not.toContain("Poll failed twice");
  });
});

const tonight = (html: string) => {
  const start = html.indexOf("Tonight");
  return html.slice(start, html.indexOf("Today and tomorrow", start));
};
const sum = (rows: DashboardView["timeline"]) =>
  rows.reduce((a, r) => a + r.solarWh, 0);
const day1 = sum(sampleDashboard.timeline.slice(0, 24));
const day2 = sum(sampleDashboard.timeline.slice(24, 48));
const tomorrowRows = (rows: DashboardView["timeline"]) => rows.slice(24, 48);
const tomorrowSolarTimes = (k: number): DashboardView => {
  const s: DashboardSnapshot = {
    ...sampleSnapshot,
    timeline: sampleSnapshot.timeline.map((r, i) =>
      i >= 24 ? { ...r, solarWh: Math.round(r.solarWh * k) } : r,
    ),
  };
  return toDashboardView(s);
};
const pctLess = Math.round((1 - day2 / day1) * 100);

describe("Flow diagram cross layout", () => {
  const h = hero(render());
  const lines = [...h.matchAll(/<line\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((l) => l.includes('data-flow="'))
    .map((l) => {
      const attr = (n: string) =>
        Number(new RegExp(`\\s${n}="([^"]*)"`).exec(l)?.[1]);
      return {
        flow: /data-flow="([^"]*)"/.exec(l)?.[1],
        x1: attr("x1"),
        y1: attr("y1"),
        x2: attr("x2"),
        y2: attr("y2"),
      };
    });
  const by = (f: string) => {
    const l = lines.find((x) => x.flow === f);
    if (!l) throw new Error(`no line ${f}`);
    return l;
  };

  it("has exactly four flow lines", () => {
    expect(lines.map((l) => l.flow).sort()).toEqual([
      "battery",
      "grid",
      "home",
      "solar",
    ]);
  });

  it("makes every line strictly horizontal or vertical", () => {
    for (const l of lines) expect(l.x1 === l.x2 || l.y1 === l.y2).toBe(true);
  });

  it("shares one hub endpoint and equal lengths", () => {
    const hubs = lines.map((l) =>
      [
        [l.x1, l.y1],
        [l.x2, l.y2],
      ].map((p) => p.join(",")),
    );
    const common =
      hubs[0]?.filter((p) => hubs.every((e) => e.includes(p))) ?? [];
    expect(common).toHaveLength(1);
    const hub = (common[0] ?? "").split(",").map(Number) as [number, number];
    const len = lines.map((l) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1));
    for (const v of len)
      expect(Math.abs(v - (len[0] ?? 0))).toBeLessThanOrEqual(0.5);
    expect(len[0]).toBeGreaterThan(0);

    // far end of each line, relative to the hub
    const far = (f: string) => {
      const l = by(f);
      return l.x1 === hub[0] && l.y1 === hub[1] ? [l.x2, l.y2] : [l.x1, l.y1];
    };
    expect(far("solar")[1]).toBeLessThan(hub[1]);
    expect(far("battery")[1]).toBeGreaterThan(hub[1]);
    expect(far("grid")[0]).toBeLessThan(hub[0]);
    expect(far("home")[0]).toBeGreaterThan(hub[0]);
  });

  it("puts the SoC ring text inside the battery node", () => {
    const m =
      /<g[^>]*data-node="battery"[^>]*>([\s\S]*?)<\/g>\s*<\/g>|<g[^>]*data-node="battery"[^>]*>([\s\S]*)/.exec(
        h,
      );
    expect(m).not.toBeNull();
    expect(h.slice(h.indexOf('data-node="battery"'))).toContain(
      `${live.socPct}%`,
    );
    const inside = text(m?.[1] ?? m?.[2] ?? "");
    expect(inside).toContain(`${live.socPct}%`);
  });
});

const squash = (s: string) => s.replace(/\s+/g, "");

describe("Flow kW readings", () => {
  const h = hero(render());
  const kw = [...h.matchAll(/<text\b[^>]*data-reading="kw"[^>]*>/g)].map(
    (m) => m[0],
  );

  it("has four kW texts with an identical class", () => {
    expect(kw).toHaveLength(4);
    const classes = kw.map((k) => /\sclass="([^"]*)"/.exec(k)?.[1]);
    expect(classes[0]).toBeTruthy();
    expect(new Set(classes).size).toBe(1);
  });
});

describe("Price and cost strip", () => {
  const imp = sampleDashboard.tariffNow.importCentsPerKwh;
  const exp = sampleDashboard.tariffNow.exportCentsPerKwh;
  const t = text(hero(render()));
  const q = squash(t);

  it("shows the labelled grid price", () => {
    expect(t).toContain("Grid price now");
    expect(q).toContain(squash(`${formatMoney(imp, currency)}/kWh`));
    expect(t).toMatch(/Peak rate until 9:00\sPM/);
  });

  it("shows the home cost lines for the sample", () => {
    expect(t).toContain("Your home now");
    expect(q).toContain("$0.99/hour");
    expect(t).toContain("Solar and battery cover");
    expect(q).toContain(squash(formatKw(live.loadW)));
    expect(q).toContain("$0.13/hour");
    expect(t).toContain("Selling");
    expect(q).toContain(squash(formatKw(live.gridW)));
    expect(q).toContain(squash(`${formatMoney(exp, currency)}/kWh`));
  });

  it("hides the spending line when not buying", () => {
    expect(t).not.toContain("Spending");
    expect(t).not.toContain("Buying");
  });

  it("shows Buying and the spending amount when importing", () => {
    const b = text(
      hero(render({ view: withLive({ gridW: 1500, loadW: 2000 }) })),
    );
    expect(b).toContain("Buying");
    expect(squash(b)).toContain(`${formatMoney(72, currency)}/hour`);
    expect(squash(b)).toContain(squash(formatKw(1500)));
    expect(b).not.toContain("Selling");
  });

  it("names each line before its amount", () => {
    expect(q).toMatch(/Saving\$0\.99/);
    expect(q).toMatch(/Earning\$0\.13/);
    expect(q).not.toContain("Spending");
  });

  it("names the spending line before its amount when importing", () => {
    const b = squash(
      text(hero(render({ view: withLive({ gridW: 1500, loadW: 2000 }) }))),
    );
    expect(b).toMatch(/Spending\$0\.72/);
  });

  it("colours the Spending label like the amount; Saving and Earning stay muted", () => {
    const labelClass = (html: string, word: string) =>
      new RegExp(`<span class="([^"]*)">${word}</span>`).exec(html)?.[1];
    const buying = hero(
      render({ view: withLive({ gridW: 1500, loadW: 2000 }) }),
    );
    expect(labelClass(buying, "Spending")).toContain("text-grid-import");
    const sample = hero(render());
    expect(labelClass(sample, "Saving")).toBeDefined();
    expect(labelClass(sample, "Saving")).not.toContain("text-grid-import");
    expect(labelClass(sample, "Earning")).toBeDefined();
    expect(labelClass(sample, "Earning")).not.toContain("text-grid-import");
  });

  it("drops the old import text", () => {
    expect(t).not.toContain("to import, until");
  });
});

describe("Tooltip swatches", () => {
  const row = {
    t: Date.parse("2026-07-16T20:00:00Z"),
    load: 2.1,
    solar: 3.7,
    band: [1.8, 2.6] as [number, number],
  };
  const tipHtml = () =>
    renderToStaticMarkup(
      <TimelineTooltip
        active
        payload={[{ payload: row }]}
        timezone="America/Los_Angeles"
      />,
    );
  const range = (html: string) =>
    /<span\b[^>]*data-swatch="range"[^>]*><\/span>/.exec(html)?.[0];

  it("uses home, range and solar swatches", () => {
    const tip = tipHtml();
    for (const k of ["home", "range", "solar"])
      expect(tip).toContain(`data-swatch="${k}"`);
  });

  it("matches the legend range swatch markup", () => {
    const legend = range(render());
    expect(legend).toBeTruthy();
    expect(range(tipHtml())).toBe(legend);
  });
});

describe("Tomorrow weather tile", () => {
  const w = sampleDashboard.weatherTomorrow;
  const t = text(tonight(render()));

  it("shows the forecast, solar and sun comparison", () => {
    expect(w).not.toBeNull();
    expect(t).toContain("Tomorrow");
    expect(t).toContain("Cloudy");
    expect(t).toContain(formatTemp(24, "F"));
    expect(t).toContain(formatTemp(16, "F"));
    expect(t).toContain("80% cloud cover");
    expect(t).toContain("20% chance of rain");
    expect(t).toContain(formatKwh(day2));
    expect(t).toContain(`${pctLess}% less sun than today`);
  });

  it("says more when tomorrow has more sun", () => {
    const more = text(tonight(render({ view: tomorrowSolarTimes(3) })));
    expect(more).toContain("more sun than today");
    expect(more).not.toContain("less sun than today");
  });

  it("reads the tile from the snapshot's forecast hours (less)", () => {
    const view = tomorrowSolarTimes(0.5);
    const tomorrowWh = sum(tomorrowRows(view.timeline));
    const less = text(tonight(render({ view })));
    expect(tomorrowWh).not.toBe(day2);
    expect(less).toContain(formatKwh(tomorrowWh));
    expect(less).toContain(
      `${Math.round((1 - tomorrowWh / day1) * 100)}% less sun than today`,
    );
    expect(less).not.toContain(formatKwh(day2));
  });

  it("reads the tile from the snapshot's forecast hours (more)", () => {
    const view = tomorrowSolarTimes(3);
    const tomorrowWh = sum(tomorrowRows(view.timeline));
    const more = text(tonight(render({ view })));
    expect(more).toContain(formatKwh(tomorrowWh));
    expect(more).toContain(
      `${Math.round((tomorrowWh / day1 - 1) * 100)}% more sun than today`,
    );
    expect(more).not.toContain(formatKwh(day2));
  });
  it("omits the tile when weatherTomorrow is null", () => {
    const n = text(
      tonight(render({ view: { ...sampleDashboard, weatherTomorrow: null } })),
    );
    for (const s of [
      "Cloudy",
      "80% cloud cover",
      "20% chance of rain",
      "less sun than today",
    ])
      expect(n).not.toContain(s);
  });
});

describe("48 h chart", () => {
  const html = render();
  const t = text(html);

  it("never mentions p10 or p90", () => {
    expect(html).not.toMatch(/p10|p90/i);
  });

  it("has the custom legend and caption", () => {
    for (const s of [
      "Home use",
      "Expected range for home use",
      "Solar",
      "Peak price hours",
    ])
      expect(t).toContain(s);
    expect(t).toContain(
      "Hours after Now are a forecast. The hatched band shows where home use will most likely land.",
    );
  });
});

describe("Cost today credit wording", () => {
  it("shows Credit earned without a minus sign for a negative net", () => {
    const html = render();
    const t = text(html);
    expect(costToday.netCents).toBeLessThan(0);
    expect(t).toContain("Credit earned");
    expect(t).toContain(formatMoney(-costToday.netCents, currency));
    expect(t).not.toContain(formatMoney(costToday.netCents, currency));
  });

  it("shows Net cost for a positive net", () => {
    const view = {
      ...sampleDashboard,
      costToday: { ...costToday, netCents: 250 },
    };
    const t = text(render({ view }));
    expect(t).toContain("Net cost");
    expect(t).toContain(formatMoney(250, currency));
    expect(t).not.toContain("Credit earned");
  });
});

describe("Dashboard source", () => {
  it("does not slice the Timeline by position", () => {
    const src = readFileSync(
      new URL("./dashboard.tsx", import.meta.url),
      "utf8",
    );
    expect(src).not.toMatch(/\.slice\(\s*0\s*,\s*24\s*\)/);
    expect(src).not.toMatch(/\.slice\(\s*24/);
  });
});

// --- Rev 6: Peak hours tile and reserve sentence ----------------------------

const withSnapshot = (mut: (s: DashboardSnapshot) => void) => {
  const s = structuredClone(sampleSnapshot);
  mut(s);
  return toDashboardView(s);
};

describe("Peak hours tile", () => {
  const h = hero(render());
  const t = text(h);

  it("sits in the Right now strip with both days and estimates", () => {
    for (const s of [
      "Peak hours",
      "Today",
      "Tomorrow",
      "10.9 kWh",
      "9.3 kWh",
      "expected",
    ])
      expect(t).toContain(s);
    expect(t).toMatch(/4:00\sPM\s?[\u2013-]\s?9:00\sPM/);
  });

  it("shows today's use so far from the 16:00 actual hour", () => {
    const h16 = sampleSnapshot.timeline.find(
      (r) => Date.parse(r.hour) === Date.parse("2026-07-15T23:00:00Z"),
    );
    expect(t).toContain(`${formatKwh(h16?.loadWh ?? -1)} used so far`);
    expect(t.match(/used so far/g)).toHaveLength(1);
  });

  it("shows the usual use and the similar-temperature line", () => {
    expect(t).toContain("Usual 10.2 kWh (30 days)");
    expect(t).toContain("On days near 91\u00b0F");
    expect(t).toContain(formatKwh(11600));
    expect(t).toContain("On days near 75\u00b0F");
  });

  it("says not enough days when the similar average is null", () => {
    const view = withSnapshot((s) => {
      s.peakEstimate.tomorrow!.similarTempDays = 2;
      s.peakEstimate.tomorrow!.similarTempAvgWh = null;
    });
    const n = text(hero(render({ view })));
    expect(n).toContain("Not enough days near 75\u00b0F yet.");
    expect(n).toContain("10.2 kWh");
  });

  it("reads 'no peak hours' for a null day", () => {
    const view = withSnapshot((s) => (s.peakEstimate.tomorrow = null));
    expect(text(hero(render({ view })))).toContain("Tomorrow: no peak hours");
  });

  it("shows only the learning message under 7 days", () => {
    const view = withSnapshot((s) => (s.peakEstimate.historyDays = 3));
    const n = text(hero(render({ view })));
    expect(n).toContain("Learning your usage: 3 of 7 days");
    expect(n).not.toContain("Usual");
    expect(n).not.toContain("used so far");
  });
});

describe("Tonight reserve sentence", () => {
  const t = (view?: DashboardView) => squash(text(tonight(render({ view }))));

  it("shows the raise line and the PO sentence", () => {
    const out = t();
    expect(out).toContain(squash("Raise your backup reserve to 89%."));
    expect(out).toContain(
      squash(
        "With 20% as reserve for emergencies, an additional 69% will help you save $1.67 for tomorrow's estimated 9.3 kWh usage during peak hours.",
      ),
    );
    expect(out).not.toContain("That covers about");
  });

  it("adds 'That covers about' when the target is capped at 100%", () => {
    const view = withSnapshot((s) => {
      s.recommendation!.reserve = reservePlan(15000, 13500);
    });
    const out = t(view);
    expect(out).toContain(squash("Raise your backup reserve to 100%."));
    expect(out).toContain(squash("That covers about 10.8 kWh of it."));
  });

  it("keeps the old action line without reserve", () => {
    const view = withSnapshot((s) => delete s.recommendation!.reserve);
    const out = text(tonight(render({ view })));
    expect(out).toContain(view.recommendation!.action);
    expect(out).not.toContain("Raise your backup reserve to");
  });
});
