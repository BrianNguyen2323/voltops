import { redirect } from "next/navigation";
import { getSession } from "~/lib/session";

export default async function HomePage() {
  if (!(await getSession())) {
    redirect("/login");
  }

  return (
    <main className="bg-background flex min-h-screen items-center justify-center">
      <p className="text-foreground text-2xl font-semibold">Success</p>
    </main>
  );
}
