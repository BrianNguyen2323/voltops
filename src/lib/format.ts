export function formatKw(w: number): string {
  return `${(Math.abs(w) / 1000).toFixed(1)} kW`;
}

export function formatKwh(wh: number): string {
  return `${(wh / 1000).toFixed(1)} kWh`;
}

export function formatTemp(c: number, unit: "F" | "C"): string {
  return `${Math.round(unit === "F" ? (c * 9) / 5 + 32 : c)}°${unit}`;
}

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  );
}
