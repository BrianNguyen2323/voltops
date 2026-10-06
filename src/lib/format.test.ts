import { describe, expect, it } from "vitest";
import { formatKw, formatKwh, formatMoney, formatTemp } from "./format";

describe("formatKw", () => {
  it("formats watts as kW with 1 decimal", () => {
    expect(formatKw(4180)).toBe("4.2 kW");
    expect(formatKw(0)).toBe("0.0 kW");
  });
  it("uses the absolute value", () => {
    expect(formatKw(-2100)).toBe("2.1 kW");
  });
  it("rounds per toFixed(1)", () => {
    expect(formatKw(4150)).toBe("4.2 kW");
  });
});

describe("formatKwh", () => {
  it("formats Wh as kWh with 1 decimal", () => {
    expect(formatKwh(11040)).toBe("11.0 kWh");
    expect(formatKwh(123456)).toBe("123.5 kWh");
  });
});

describe("formatMoney", () => {
  it("formats cents in the given currency", () => {
    expect(formatMoney(310, "USD")).toBe("$3.10");
    expect(formatMoney(-45, "USD")).toBe("-$0.45");
  });
});

describe("formatTemp", () => {
  it("rounds to an integer with the unit", () => {
    expect(formatTemp(21.7, "C")).toBe("22°C");
    expect(formatTemp(21.7, "F")).toBe("71°F");
    expect(formatTemp(24, "F")).toBe("75°F");
    expect(formatTemp(-3.4, "C")).toBe("-3°C");
  });
});
