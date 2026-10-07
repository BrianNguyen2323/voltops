"use client";

import { useActionState } from "react";

type Action = (
  prev: unknown,
  formData: FormData,
) => Promise<{ error: string } | void>;

export function AuthForm({
  title,
  hint,
  action,
  confirm,
}: {
  title: string;
  hint?: string;
  action: Action;
  confirm?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const input =
    "border-border bg-background text-foreground w-full rounded-lg border px-4 py-3";
  return (
    <main className="bg-background flex min-h-screen flex-col items-center justify-center px-4">
      <form
        action={formAction}
        className="border-border bg-card flex w-full max-w-sm flex-col gap-4 rounded-xl border p-8"
      >
        <h1 className="text-foreground text-xl font-semibold">{title}</h1>
        {hint && <p className="text-muted-foreground text-sm">{hint}</p>}
        <input
          name="password"
          type="password"
          placeholder="Password"
          autoComplete={confirm ? "new-password" : "current-password"}
          required
          className={input}
        />
        {confirm && (
          <input
            name="confirm"
            type="password"
            placeholder="Confirm password"
            autoComplete="new-password"
            required
            className={input}
          />
        )}
        {state?.error && (
          <p role="alert" className="text-sm text-red-500">
            {state.error}
          </p>
        )}
        <button
          disabled={pending}
          className="bg-primary rounded-lg px-6 py-3 font-semibold text-black disabled:opacity-60"
        >
          Continue
        </button>
      </form>
    </main>
  );
}
