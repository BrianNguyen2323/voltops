import { db } from "~/server/db";
import { credentials } from "~/server/db/schema";

export default async function HomePage() {
  const connected = !!db.select({ id: credentials.id }).from(credentials).get();

  return (
    <main className="bg-background flex min-h-screen flex-col items-center justify-center gap-4">
      {connected ? (
        <p className="text-foreground text-2xl font-semibold">
          Tesla connected
        </p>
      ) : (
        <a
          href="/api/auth/tesla"
          className="bg-primary rounded-lg px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90"
        >
          Connect Tesla
        </a>
      )}
    </main>
  );
}
