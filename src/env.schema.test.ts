import { createEnv } from "@t3-oss/env-nextjs";
import { describe, expect, it } from "vitest";
import { server } from "./env.schema.js";

// Same options as src/env.js, but validating, and only the panel keys.
const parse = (runtimeEnv: Record<string, string | undefined>) =>
  createEnv({
    server: {
      SITE_PANEL_COUNT: server.SITE_PANEL_COUNT,
      SITE_PANEL_WATTS: server.SITE_PANEL_WATTS,
    },
    client: {},
    runtimeEnv,
    emptyStringAsUndefined: true,
    skipValidation: false,
    onValidationError: (issues) => {
      throw new Error(JSON.stringify(issues));
    },
  });

describe.each(["SITE_PANEL_COUNT", "SITE_PANEL_WATTS"] as const)(
  "%s",
  (key) => {
    it.each(["0", "-1", "2.5", "abc"])("rejects %j", (v) => {
      expect(() => parse({ [key]: v })).toThrow(key);
    });

    it("accepts 24 as a number", () => {
      expect(parse({ [key]: "24" })[key]).toBe(24);
    });

    it.each([undefined, ""])("%j means unset", (v) => {
      expect(parse({ [key]: v })[key]).toBeUndefined();
    });
  },
);
