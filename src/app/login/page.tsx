import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In — VoltOps",
};

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 13 22"
      fill="currentColor"
    >
      <path d="M9 0L0 13h7L4 22l10-13H7L9 0z" />
    </svg>
  );
}

function Logo() {
  return (
    <span className="text-foreground inline-flex items-center text-2xl font-bold tracking-tight">
      Vol
      <BoltIcon className="text-primary h-[0.82em] w-auto" />
      Ops
    </span>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const errorMessages: Record<string, string> = {
    access_denied: "Tesla access was denied. Please try again.",
    invalid_request: "Something went wrong. Please try again.",
    invalid_state: "Session expired. Please try again.",
    token_exchange_failed: "Could not connect to Tesla. Please try again.",
    db_error: "An unexpected error occurred. Please try again.",
  };

  return (
    <main className="bg-background flex min-h-screen flex-col items-center justify-center px-4">
      <div className="border-border bg-surface flex w-full max-w-sm flex-col items-center gap-6 rounded-xl border p-8">
        <Logo />

        <div className="text-center">
          <h1 className="text-foreground mb-2 text-xl font-semibold">
            Connect your Tesla
          </h1>
          <p className="text-muted text-sm">
            Sign in with your Tesla account to manage your Powerwall
          </p>
        </div>

        <a
          href="/api/auth/tesla"
          className="bg-primary w-full rounded-lg px-6 py-3 text-center font-semibold text-black transition-opacity hover:opacity-90"
        >
          Connect with Tesla
        </a>
      </div>
    </main>
  );
}
