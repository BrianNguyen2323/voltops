import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const css = read("src/styles/globals.css");

const FG = "#f5f5f5";
const vars: Record<string, string> = {
  background: "#08070e",
  foreground: FG,
  "card-foreground": FG,
  "popover-foreground": FG,
  "secondary-foreground": FG,
  "accent-foreground": FG,
  card: "#17171d",
  popover: "#17171d",
  primary: "#00ffb2",
  "primary-foreground": "#08070e",
  secondary: "#202026",
  muted: "#202026",
  accent: "#202026",
  "muted-foreground": "#b0b0b0",
  destructive: "#ff0066",
  border: "#202026",
  input: "#202026",
  ring: "#00ffb2",
  "chart-1": "#ffb547",
  "chart-2": "#00ffb2",
  "chart-3": FG,
  "chart-4": "#ff0066",
  "chart-5": "#8b93ff",
};

describe("globals.css tokens", () => {
  for (const [name, hex] of Object.entries(vars)) {
    it(`defines --${name}: ${hex}`, () => {
      const m = new RegExp(`(?<![\\w-])--${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(css);
      expect(m?.[1]?.toLowerCase()).toBe(hex);
    });
  }

  it("has an @theme inline block", () => {
    expect(css).toMatch(/@theme\s+inline\s*\{/);
  });

  const inline = css.slice(css.search(/@theme\s+inline\s*\{/));
  for (const name of Object.keys(vars)) {
    it(`maps --color-${name} in @theme inline`, () => {
      expect(inline).toMatch(
        new RegExp(`--color-${name}\\s*:\\s*var\\(--${name}\\)`),
      );
    });
  }

  const semantic: Record<string, string> = {
    solar: "chart-1",
    battery: "chart-2",
    home: "chart-3",
    "grid-import": "chart-4",
    "grid-export": "chart-5",
  };
  for (const [name, target] of Object.entries(semantic)) {
    it(`maps --color-${name} to var(--${target})`, () => {
      expect(inline).toMatch(
        new RegExp(`--color-${name}\\s*:\\s*var\\(--${target}\\)`),
      );
    });
  }

  it("has no --color-surface", () => {
    expect(css).not.toContain("--color-surface");
  });
});

describe("shadcn setup", () => {
  it("components.json style is radix-nova", () => {
    expect((JSON.parse(read("components.json")) as { style: string }).style).toBe("radix-nova");
  });

  for (const c of ["button", "card", "badge", "chart"]) {
    it(`src/components/ui/${c}.tsx exists`, () => {
      expect(existsSync(join(root, `src/components/ui/${c}.tsx`))).toBe(true);
    });
  }
});

describe("layout font", () => {
  const layout = read("src/app/layout.tsx");
  it("uses Archivo", () => {
    expect(layout).toMatch(/\bArchivo\b/);
  });
  it("drops Geist and Figtree", () => {
    expect(layout).not.toMatch(/Geist/);
    expect(layout).not.toMatch(/Figtree/);
  });
});
