import { describe, expect, it } from "vitest";
import { addDays, localDate, localMidnight, localParts } from "~/lib/time";

const LA = "America/Los_Angeles";
const H = 3_600_000;

describe("localParts", () => {
  it("returns site-local parts with Monday = 0", () => {
    // 2026-07-15T12:00Z = 05:00 PDT, a Wednesday
    expect(localParts(Date.UTC(2026, 6, 15, 12, 0), LA)).toEqual({
      year: 2026, month: 7, day: 15, hour: 5, minute: 0, weekday: 2,
    });
  });

  it("maps Monday to 0 and Sunday to 6", () => {
    expect(localParts(Date.UTC(2026, 6, 13, 19, 0), LA).weekday).toBe(0);
    expect(localParts(Date.UTC(2026, 6, 19, 19, 0), LA).weekday).toBe(6);
  });

  it("rolls the local date back across UTC midnight, with hour 0-23 and minutes", () => {
    // 2026-01-01T00:30Z = 2025-12-31 16:30 PST
    expect(localParts(Date.UTC(2026, 0, 1, 0, 30), LA)).toEqual({
      year: 2025, month: 12, day: 31, hour: 16, minute: 30, weekday: 2,
    });
    // local midnight must be hour 0, not 24
    expect(localParts(Date.UTC(2026, 6, 15, 7, 0), LA).hour).toBe(0);
  });
});

describe("localDate", () => {
  it("formats YYYY-MM-DD in the site tz", () => {
    expect(localDate(Date.UTC(2026, 6, 16, 6, 59), LA)).toBe("2026-07-15");
    expect(localDate(Date.UTC(2026, 6, 16, 7, 0), LA)).toBe("2026-07-16");
    expect(localDate(Date.UTC(2026, 6, 15, 16, 0), "Asia/Tokyo")).toBe("2026-07-16");
  });
});

describe("addDays", () => {
  it("adds and subtracts across month, year and leap boundaries", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-07-15", 0)).toBe("2026-07-15");
    expect(addDays("2026-07-15", 8)).toBe("2026-07-23");
  });
});

describe("localMidnight", () => {
  it("is a plain offset on a normal day", () => {
    expect(localMidnight("2026-07-15", LA)).toBe(Date.UTC(2026, 6, 15, 7, 0));
    expect(localMidnight("2026-01-15", LA)).toBe(Date.UTC(2026, 0, 15, 8, 0));
  });

  it("handles spring-forward (2026-03-08 is 23 h)", () => {
    expect(localMidnight("2026-03-08", LA)).toBe(Date.UTC(2026, 2, 8, 8, 0));
    const next = localMidnight(addDays("2026-03-08", 1), LA);
    expect(next).toBe(Date.UTC(2026, 2, 9, 7, 0));
    expect(next - localMidnight("2026-03-08", LA)).toBe(23 * H);
  });

  it("handles fall-back (2026-11-01 is 25 h)", () => {
    expect(localMidnight("2026-11-01", LA)).toBe(Date.UTC(2026, 10, 1, 7, 0));
    const next = localMidnight(addDays("2026-11-01", 1), LA);
    expect(next).toBe(Date.UTC(2026, 10, 2, 8, 0));
    expect(next - localMidnight("2026-11-01", LA)).toBe(25 * H);
  });

  it("round-trips through localDate/localParts", () => {
    const ms = localMidnight("2026-11-01", LA);
    expect(localDate(ms, LA)).toBe("2026-11-01");
    expect(localParts(ms, LA)).toMatchObject({ hour: 0, minute: 0 });
  });
});
