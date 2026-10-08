import { describe, expect, it } from "vitest";

import { sampleSnapshot } from "~/app/(protected)/home/data";
import {
  confidenceInfo,
  dayWord,
  reserveSteps,
} from "~/components/dashboard/tonight";
import { toDashboardView, type DashboardSnapshot } from "~/lib/dashboard";

const TZ = "America/Los_Angeles";
const sampleView = toDashboardView(sampleSnapshot);

const viewWith = (mut: (s: DashboardSnapshot) => void) => {
  const s = structuredClone(sampleSnapshot);
  mut(s);
  return toDashboardView(s);
};

// reserveSteps returns [{ lead, rest }, ...]: lead is the bold part, rest follows it directly.
const steps = (v = sampleView) =>
  reserveSteps(v)
    .map((s) => s.lead + s.rest)
    .join(" ");

describe("dayWord", () => {
  const updated = "2026-07-15T19:00:00Z"; // Wednesday 12:00 PDT

  it("same local date: 'tonight' from 17:00, 'today' before", () => {
    expect(dayWord("2026-07-16T04:00:00Z", updated, TZ)).toBe("tonight"); // 21:00
    expect(dayWord("2026-07-16T00:00:00Z", updated, TZ)).toBe("tonight"); // 17:00
    expect(dayWord("2026-07-15T23:59:00Z", updated, TZ)).toBe("today"); // 16:59
    expect(dayWord("2026-07-15T17:00:00Z", updated, TZ)).toBe("today"); // 10:00
  });

  it("next local date is 'tomorrow'", () => {
    expect(dayWord("2026-07-16T23:00:00Z", updated, TZ)).toBe("tomorrow");
    expect(dayWord("2026-07-16T07:00:00Z", updated, TZ)).toBe("tomorrow"); // 00:00
  });

  it("two days out is the weekday name", () => {
    expect(dayWord("2026-07-17T23:00:00Z", updated, TZ)).toBe("Friday");
    expect(dayWord("2026-07-18T23:00:00Z", updated, TZ)).toBe("Saturday");
  });

  it("compares local dates, not UTC dates", () => {
    // 21:00 PDT is already the next UTC date but the same local date.
    expect(dayWord("2026-07-16T04:00:00Z", "2026-07-15T22:00:00Z", TZ)).toBe(
      "tonight",
    );
  });

  it("DST fall-back day (2026-11-01, PST from 09:00Z)", () => {
    const u = "2026-11-01T20:00:00Z"; // 12:00 PST
    expect(dayWord("2026-11-02T05:00:00Z", u, TZ)).toBe("tonight"); // 21:00 PST, UTC date is 11/02
    expect(dayWord("2026-11-02T01:00:00Z", u, TZ)).toBe("tonight"); // 17:00 PST
    expect(dayWord("2026-11-02T00:00:00Z", u, TZ)).toBe("today"); // 16:00 PST
    expect(dayWord("2026-11-02T20:00:00Z", u, TZ)).toBe("tomorrow"); // 12:00 PST 11/2
    expect(dayWord("2026-11-03T00:00:00Z", u, TZ)).toBe("tomorrow"); // 16:00 PST 11/2
  });

  it("DST spring-forward day (2026-03-08, PDT from 10:00Z)", () => {
    const u = "2026-03-08T20:00:00Z"; // 13:00 PDT
    expect(dayWord("2026-03-09T06:00:00Z", u, TZ)).toBe("tonight"); // 23:00 PDT
    expect(dayWord("2026-03-09T07:00:00Z", u, TZ)).toBe("tomorrow"); // 00:00 PDT
    expect(dayWord("2026-03-09T23:00:00Z", u, TZ)).toBe("tomorrow"); // 16:00 PDT
  });
});

describe("reserveSteps", () => {
  it("sample view: the two sentences", () => {
    expect(steps()).toBe(
      "Tonight at 9:00 PM, after today's peak hours end, raise it to 89%. " +
        "Tomorrow at 4:00 PM, when peak hours start, lower it back to 20% so the battery covers the peak.",
    );
  });

  it("returns two steps, each with a bold lead", () => {
    const s = reserveSteps(sampleView);
    expect(s).toHaveLength(2);
    expect(s[0]!.lead).toBe("Tonight at 9:00 PM");
    expect(s[1]!.lead).toBe("Tomorrow at 4:00 PM");
  });

  it("validFrom at or before updatedAt: 'Now, raise it to 89%.'", () => {
    const v = viewWith((s) => (s.recommendation!.validFrom = s.updatedAt));
    expect(reserveSteps(v)[0]).toEqual({
      lead: "Now",
      rest: ", raise it to 89%.",
    });
    expect(
      steps(v).startsWith("Now, raise it to 89%. Tomorrow at 4:00 PM"),
    ).toBe(true);
  });

  it("uses today's word before 17:00 and the weekday for later days", () => {
    const v = viewWith((s) => {
      s.updatedAt = "2026-07-15T15:00:00Z"; // 08:00 PDT
      s.recommendation!.validFrom = "2026-07-15T21:00:00Z"; // 14:00 PDT
      s.recommendation!.validTo = "2026-07-17T23:00:00Z"; // Friday 16:00
    });
    const s = reserveSteps(v);
    expect(s[0]!.lead).toBe("Today at 2:00 PM");
    expect(s[1]!.lead).toBe("Friday at 4:00 PM");
  });
});

describe("confidenceInfo", () => {
  it("sample (medium): three sections with the SPEC copy", () => {
    const info = confidenceInfo(sampleView)!;
    expect(info.map((i) => i.title)).toEqual([
      "Why medium confidence",
      "If tomorrow's forecast high changes",
      "If your tariff changes",
    ]);
    expect(info[0]!.text).toBe(
      "Based on 6 past days with a high near 75°F (8.4 kWh on average), mixed with your usual peak use: 10.2 kWh over 30 days.",
    );
    expect(info[1]!.text).toBe(
      "This uses days with a high between 70°F and 81°F. If the forecast moves outside that range, other days are used. Hotter or colder days usually mean more AC or heating, so a higher reserve. The advice updates on its own.",
    );
    expect(info[2]!.text).toBe(
      "Your peak hours are 4:00 PM–9:00 PM. If they move, the raise and lower times move with them. The saving is the gap between peak and off-peak prices: a smaller gap means a smaller saving. If your plan has no peak hours, there is no advice.",
    );
  });

  it("title follows the confidence level", () => {
    const v = viewWith((s) => (s.recommendation!.confidence = "high"));
    expect(confidenceInfo(v)![0]!.title).toBe("Why high confidence");
  });

  it("low with 1 similar day: 'Only 1 past day ...'", () => {
    const v = viewWith((s) => {
      s.recommendation!.confidence = "low";
      s.peakEstimate.tomorrow!.similarTempDays = 1;
      s.peakEstimate.tomorrow!.similarTempAvgWh = null;
    });
    const [why] = confidenceInfo(v)!;
    expect(why!.title).toBe("Why low confidence");
    expect(why!.text).toBe(
      "Only 1 past day had a high near 75°F; 3 are needed. Until then this uses your usual peak use: 10.2 kWh over 30 days.",
    );
  });

  it("low with 2 similar days: 'Only 2 past days ...'", () => {
    const v = viewWith((s) => {
      s.recommendation!.confidence = "low";
      s.peakEstimate.tomorrow!.similarTempDays = 2;
      s.peakEstimate.tomorrow!.similarTempAvgWh = null;
    });
    expect(confidenceInfo(v)![0]!.text).toMatch(
      /^Only 2 past days had a high near 75°F; 3 are needed\./,
    );
  });

  it("low with 0 similar days: 'No past days ...'", () => {
    const v = viewWith((s) => {
      s.recommendation!.confidence = "low";
      s.peakEstimate.tomorrow!.similarTempDays = 0;
      s.peakEstimate.tomorrow!.similarTempAvgWh = null;
    });
    expect(confidenceInfo(v)![0]!.text).toBe(
      "No past days had a high near 75°F yet; 3 are needed. Until then this uses your usual peak use: 10.2 kWh over 30 days.",
    );
  });

  it("medium at the 3-day boundary", () => {
    const v = viewWith((s) => {
      s.peakEstimate.tomorrow!.similarTempDays = 3;
      s.peakEstimate.tomorrow!.similarTempAvgWh = 9000;
    });
    expect(confidenceInfo(v)![0]!.text).toBe(
      "Based on 3 past days with a high near 75°F (9.0 kWh on average), mixed with your usual peak use: 10.2 kWh over 30 days.",
    );
  });

  it("band and temperatures follow the display unit (deg C: 24 +/- 3)", () => {
    const v = viewWith((s) => (s.site.temperatureUnit = "C"));
    const info = confidenceInfo(v)!;
    expect(info[0]!.text).toContain("a high near 24°C");
    expect(info[1]!.text).toContain("between 21°C and 27°C");
  });

  it("is null without a reserve", () => {
    const v = viewWith((s) => delete s.recommendation!.reserve);
    expect(confidenceInfo(v)).toBeNull();
  });

  it("is null without tomorrow's peak usage", () => {
    const v = viewWith((s) => (s.peakEstimate.tomorrow = null));
    expect(confidenceInfo(v)).toBeNull();
  });
});
