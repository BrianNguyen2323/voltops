import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuthForm } from "./auth-form";

describe("AuthForm", () => {
  const html = renderToStaticMarkup(
    createElement(AuthForm, {
      title: "Sign in",
      hint: "a hint",
      action: async () => undefined,
    }),
  );

  it("uses shadcn token class names", () => {
    expect(html).toContain("bg-card");
    expect(html).toContain("text-muted-foreground");
  });

  it("no longer uses bg-surface", () => {
    expect(html).not.toContain("bg-surface");
  });
});
