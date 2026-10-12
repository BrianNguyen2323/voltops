import { z } from "zod";

const HOUR = 3_600_000;
const nums = z.array(z.number().nullable());
const Resp = z.object({
  hourly: z.object({
    time: z.array(z.number()),
    temperature_2m: nums,
    cloud_cover: nums,
    shortwave_radiation: nums,
    precipitation: nums,
    precipitation_probability: nums.optional(),
  }),
});

export type WeatherRow = {
  hour: number;
  tempC: number;
  cloudPct: number;
  ghiWm2: number;
  precipMm: number;
  precipProbPct: number;
};

export function mapForecast(json: unknown, fetchedAtMs: number) {
  const parsed = Resp.safeParse(json);
  if (!parsed.success) throw new Error("open-meteo: bad response");
  const h = parsed.data.hourly;
  const observed: WeatherRow[] = [];
  const forecast: WeatherRow[] = [];
  // shortwave_radiation at T is the mean of the preceding hour, so GHI for hour H is at index i+1.
  for (let i = 0; i < h.time.length - 1; i++) {
    const tempC = h.temperature_2m[i];
    const cloudPct = h.cloud_cover[i];
    const ghiWm2 = h.shortwave_radiation[i + 1];
    if (tempC == null || cloudPct == null || ghiWm2 == null) continue;
    const hour = h.time[i]! * 1000;
    const row = {
      hour,
      tempC,
      cloudPct,
      ghiWm2,
      precipMm: h.precipitation[i] ?? 0,
      precipProbPct: h.precipitation_probability?.[i] ?? 0,
    };
    (hour + HOUR <= fetchedAtMs ? observed : forecast).push(row);
  }
  return { observed, forecast };
}

export async function fetchWeather(o: {
  fetch: typeof fetch;
  lat: number;
  lon: number;
  now: number;
  pastDays?: number;
  forecastDays?: number;
}) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${o.lat.toFixed(2)}&longitude=${o.lon.toFixed(2)}` +
    "&hourly=temperature_2m,cloud_cover,shortwave_radiation,precipitation,precipitation_probability" +
    `&past_days=${o.pastDays ?? 1}&forecast_days=${o.forecastDays ?? 3}&timezone=UTC&timeformat=unixtime`;
  const res = await o.fetch(url);
  if (!res.ok) throw new Error(`open-meteo: ${res.status}`);
  return mapForecast(await res.json(), o.now);
}

/** Past days only, no forecast; `start`/`end` are UTC dates. */
export async function fetchArchive(o: {
  fetch: typeof fetch;
  lat: number;
  lon: number;
  now: number;
  start: string;
  end: string;
}) {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${o.lat.toFixed(2)}&longitude=${o.lon.toFixed(2)}` +
    `&start_date=${o.start}&end_date=${o.end}` +
    "&hourly=temperature_2m,cloud_cover,shortwave_radiation,precipitation" +
    "&timezone=UTC&timeformat=unixtime";
  const res = await o.fetch(url);
  if (!res.ok) throw new Error(`open-meteo: ${res.status}`);
  return mapForecast(await res.json(), o.now);
}
