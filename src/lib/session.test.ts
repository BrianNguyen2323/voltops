import { describe, expect, it } from "vitest";
import { sign, verify } from "~/lib/session";

const secret = "test-secret-test-secret-test-secret";

describe("session sign/verify", () => {
  it("round-trips a value", () => {
    expect(verify(sign("owner", secret), secret)).toBe("owner");
  });

  it("returns null for a wrong secret", () => {
    expect(verify(sign("owner", secret), "other-secret")).toBeNull();
  });

  it("returns null for a tampered value", () => {
    const signed = sign("owner", secret);
    const dot = signed.lastIndexOf(".");
    expect(verify("admin" + signed.slice(dot), secret)).toBeNull();
  });

  it("returns null for a wrong-length signature, without throwing", () => {
    const signed = sign("owner", secret);
    expect(verify(signed.slice(0, -4), secret)).toBeNull();
    expect(verify(signed + "abcd", secret)).toBeNull();
    expect(verify("owner.", secret)).toBeNull();
  });

  it("returns null for a dot-less value", () => {
    expect(verify("owner", secret)).toBeNull();
    expect(verify("", secret)).toBeNull();
  });
});
