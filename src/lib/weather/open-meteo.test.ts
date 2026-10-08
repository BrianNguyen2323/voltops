import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fetchWeather, mapForecast } from "~/lib/weather/open-meteo";

const HOUR = 3_600_000;
const fixture = JSON.parse(
  readFileSync("fixtures/open-meteo/forecast.json", "utf8"),
) as {
  hourly: {
    time: number[];
    temperature_2m: (number | null)[];
    cloud_cover: (number | null)[];
    shortwave_radiation: (number | null)[];
    precipitation: (number | null)[];
    precipitation_probability: (number | null)[];
  };
};
const FETCHED_AT = 1791340007841;
const okFetch = () => vi.fn(async () => new Response(JSON.stringify(fixture)));
const SITE = { lat: 34.05, lon: -118.24, now: FETCHED_AT };

function small(over: Partial<Record<string, (number | null)[]>> = {}) {
  // 4 hours: t0..t3 (unix seconds); the last row has no H+1 value.
  return {
    hourly: {
      time: [0, 3600, 7200, 10800],
      temperature_2m: [10, 11, 12, 13],
      cloud_cover: [20, 30, 40, 50],
      shortwave_radiation: [100, 200, 300, 400],
      precipitation: [0, 0.5, 1, 1.5],
      precipitation_probability: [5, 10, 15, 20],
      ...over,
    },
  };
}

describe("mapForecast", () => {
  it("shifts GHI by one hour and keeps other variables at H", () => {
    const { observed, forecast } = mapForecast(small(), 10 * HOUR);
    const rows = [...observed, ...forecast];
    expect(rows).toEqual([
      { hour: 0, tempC: 10, cloudPct: 20, ghiWm2: 200, precipMm: 0, precipProbPct: 5 },
      { hour: HOUR, tempC: 11, cloudPct: 30, ghiWm2: 300, precipMm: 0.5, precipProbPct: 10 },
      { hour: 2 * HOUR, tempC: 12, cloudPct: 40, ghiWm2: 400, precipMm: 1, precipProbPct: 15 },
    ]);
  });

  it("drops the last hour", () => {
    const { observed, forecast } = mapForecast(small(), 10 * HOUR);
    expect(observed.length + forecast.length).toBe(3);
  });

  it("splits observed (hour + 1h <= fetchedAt) from forecast", () => {
    const { observed, forecast } = mapForecast(small(), 2 * HOUR);
    expect(observed.map((r) => r.hour)).toEqual([0, HOUR]);
    expect(forecast.map((r) => r.hour)).toEqual([2 * HOUR]);
  });

  it("turns null precip and probability into 0", () => {
    const { observed } = mapForecast(
      small({ precipitation: [null, 0, 0, 0], precipitation_probability: [null, 0, 0, 0] }),
      10 * HOUR,
    );
    expect(observed[0]).toMatchObject({ precipMm: 0, precipProbPct: 0 });
  });

  it("drops rows with null temp, cloud, or ghi", () => {
    const { observed } = mapForecast(
      small({ temperature_2m: [10, null, 12, 13] }),
      10 * HOUR,
    );
    expect(observed.map((r) => r.hour)).toEqual([0, 2 * HOUR]);
    const c = mapForecast(small({ cloud_cover: [20, 30, null, 50] }), 10 * HOUR);
    expect(c.observed.map((r) => r.hour)).toEqual([0, HOUR]);
    // ghi for hour H comes from H+1, so a null at index 2 drops hour 1.
    const g = mapForecast(small({ shortwave_radiation: [100, 200, null, 400] }), 10 * HOUR);
    expect(g.observed.map((r) => r.hour)).toEqual([0, 2 * HOUR]);
  });

  it("maps the recorded fixture", () => {
    const h = fixture.hourly;
    const { observed, forecast } = mapForecast(fixture, FETCHED_AT);
    const rows = [...observed, ...forecast];
    expect(rows).toHaveLength(h.time.length - 1);
    rows.forEach((r, i) => {
      expect(r.hour).toBe(h.time[i]! * 1000);
      expect(r.ghiWm2).toBe(h.shortwave_radiation[i + 1]);
      expect(r.tempC).toBe(h.temperature_2m[i]);
    });
    expect(observed.every((r) => r.hour + HOUR <= FETCHED_AT)).toBe(true);
    expect(forecast.every((r) => r.hour + HOUR > FETCHED_AT)).toBe(true);
    expect(observed.length).toBeGreaterThan(0);
    expect(forecast.length).toBeGreaterThan(0);
  });

  it("throws on a bad shape", () => {
    expect(() => mapForecast({ hourly: { time: "nope" } }, 0)).toThrow(
      "open-meteo: bad response",
    );
    expect(() => mapForecast({}, 0)).toThrow("open-meteo: bad response");
  });
});

describe("fetchWeather", () => {
  it("builds the URL with 2-decimal coords and the expected params", async () => {
    const fetch = okFetch();
    await fetchWeather({ fetch, lat: 34.0522342, lon: -118.2436849, now: FETCHED_AT });
    const url = new URL(String((fetch.mock.calls[0] as unknown[])[0]));
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    const p = url.searchParams;
    expect(p.get("latitude")).toBe("34.05");
    expect(p.get("longitude")).toBe("-118.24");
    expect(p.get("hourly")).toBe(
      "temperature_2m,cloud_cover,shortwave_radiation,precipitation,precipitation_probability",
    );
    expect(p.get("past_days")).toBe("1");
    expect(p.get("forecast_days")).toBe("3");
    expect(p.get("timezone")).toBe("UTC");
    expect(p.get("timeformat")).toBe("unixtime");
  });

  it("returns mapForecast(json, now)", async () => {
    const out = await fetchWeather({ fetch: okFetch(), ...SITE });
    expect(out).toEqual(mapForecast(fixture, FETCHED_AT));
  });

  it("throws with the status on non-2xx", async () => {
    const fetch = vi.fn(async () => new Response("x", { status: 503 }));
    await expect(fetchWeather({ fetch, ...SITE })).rejects.toThrow("open-meteo: 503");
  });

  it("throws on a bad-shape body", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ hourly: {} })));
    await expect(fetchWeather({ fetch, ...SITE })).rejects.toThrow("open-meteo: bad response");
  });
});

describe("fetchWeather pastDays / forecastDays (B017)", () => {
  const paramsFor = async (extra: { pastDays?: number; forecastDays?: number }) => {
    const fetch = okFetch();
    await fetchWeather({ fetch, ...SITE, ...extra });
    return new URL(String((fetch.mock.calls[0] as unknown[])[0])).searchParams;
  };

  it("defaults to past_days=1 and forecast_days=3", async () => {
    const p = await paramsFor({});
    expect(p.get("past_days")).toBe("1");
    expect(p.get("forecast_days")).toBe("3");
  });

  it("uses the given pastDays and forecastDays", async () => {
    const p = await paramsFor({ pastDays: 45, forecastDays: 1 });
    expect(p.get("past_days")).toBe("45");
    expect(p.get("forecast_days")).toBe("1");
  });

  it("overriding one keeps the other default", async () => {
    const p = await paramsFor({ pastDays: 7 });
    expect(p.get("past_days")).toBe("7");
    expect(p.get("forecast_days")).toBe("3");
  });
});
