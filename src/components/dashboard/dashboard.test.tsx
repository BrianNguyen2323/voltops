import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { sampleDashboard, type DashboardData } from "~/app/(protected)/home/data";
import { Dashboard } from "~/components/dashboard/dashboard";
import { formatKw, formatKwh, formatMoney } from "~/lib/format";

type Props = {
  data?: DashboardData;
  connected?: boolean;
  isSample?: boolean;
  showLogout?: boolean;
};

const render = ({ data = sampleDashboard, connected = true, isSample = true, showLogout = true }: Props = {}) =>
  renderToStaticMarkup(<Dashboard data={data} connected={connected} isSample={isSample} showLogout={showLogout} />);

const withLive = (live: Partial<DashboardData["live"]>): DashboardData => ({
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
  [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => text(m[1] ?? "").trim());

const hero = (html: string) => {
  const start = html.indexOf("Right now");
  const end = html.indexOf("Tonight", start);
  return html.slice(start, end);
};

const { live, today, costToday, currency, recommendation } = sampleDashboard;

describe("Dashboard structure", () => {
  const html = render();

  it("has the site name as the only h1", () => {
    const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => text(m[1] ?? "").trim());
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
    expect(text(off)).toContain("Connect your Tesla account to see your own system");
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
    const charging = text(hero(render({ data: withLive({ batteryW: -1500 }) })));
    expect(charging).toMatch(/\bCharging\b/);
    expect(charging).not.toMatch(/\bIdle\b/);
    expect(charging).toContain(formatKw(1500));
    expect(charging).not.toMatch(/[-−]\s?\d/);

    const discharging = text(hero(render({ data: withLive({ batteryW: 1500 }) })));
    expect(discharging).toMatch(/\bDischarging\b/);
    expect(discharging).not.toMatch(/\bIdle\b/);

    const importing = text(hero(render({ data: withLive({ gridW: 2000 }) })));
    expect(importing).toMatch(/\bImporting\b/);
    expect(importing).not.toMatch(/\bExporting\b/);
  });

  it("treats 50 W as discharging and 49 W as idle", () => {
    expect(text(hero(render({ data: withLive({ batteryW: 50 }) })))).toMatch(/\bDischarging\b/);
    expect(text(hero(render({ data: withLive({ batteryW: -49 }) })))).toMatch(/\bIdle\b/);
  });

  it("has an svg role=img with a non-empty aria-label naming the flows", () => {
    const m = /<svg[^>]*role="img"[^>]*>/.exec(h);
    expect(m).not.toBeNull();
    const label = /aria-label="([^"]*)"/.exec(m?.[0] ?? "")?.[1] ?? "";
    expect(label.trim().length).toBeGreaterThan(0);
    for (const word of ["Solar", "Home", "Powerwall", "Grid"]) expect(label).toContain(word);
  });

  it("shows the tariff chip with period and import price", () => {
    expect(t).toContain("Peak");
    expect(t).toContain(formatMoney(sampleDashboard.tariffNow.importCentsPerKwh, currency));
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
    expect(t).toContain(recommendation.action);
    for (const line of recommendation.why) expect(t).toContain(line);
    expect(t).toContain(recommendation.wouldChange);
    expect(t).toContain(formatKwh(recommendation.effectWh));
    expect(t).toContain(formatMoney(recommendation.savingsCents, currency));
    expect(t.toLowerCase()).toContain(recommendation.confidence);
  });

  it("shows the empty state when recommendation is null", () => {
    const t = text(render({ data: { ...sampleDashboard, recommendation: null } }));
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
    for (const p of costToday.periods) expect(t).toContain(formatMoney(p.costCents, currency));
    expect(t).toContain(formatMoney(costToday.exportCreditCents, currency));
    expect(t).toContain(formatMoney(costToday.netCents, currency));
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
      render({ data: { ...sampleDashboard, health: { ...sampleDashboard.health, warnings: ["Poll failed twice"] } } }),
    );
    expect(warned).toContain("Poll failed twice");
    expect(t).not.toContain("Poll failed twice");
  });
});
