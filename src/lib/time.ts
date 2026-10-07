const fmts = new Map<string, Intl.DateTimeFormat>();
const fmt = (tz: string) => {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric",
      day: "numeric", hour: "numeric", minute: "numeric",
    });
    fmts.set(tz, f);
  }
  return f;
};

/** Site-local wall-clock parts. weekday: 0 = Monday ... 6 = Sunday. */
export function localParts(ms: number, tz: string) {
  const p: Record<string, number> = {};
  for (const { type, value } of fmt(tz).formatToParts(ms)) p[type] = Number(value);
  const year = p.year!, month = p.month!, day = p.day!;
  return {
    year, month, day, hour: p.hour!, minute: p.minute!,
    weekday: (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function localDate(ms: number, tz: string): string {
  const p = localParts(ms, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** UTC ms of local 00:00 on `date`; DST-safe via offset correction. */
export function localMidnight(date: string, tz: string): number {
  const utc = Date.parse(`${date}T00:00:00Z`);
  let ms = utc;
  for (let i = 0; i < 2; i++) {
    const p = localParts(ms, tz);
    ms -= Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - utc;
  }
  return ms;
}
