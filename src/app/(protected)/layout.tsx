import { logoutAction } from "~/app/login/actions";
import { isAuthDisabled, requireAdmin } from "~/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();
  return (
    <>
      {!isAuthDisabled() && (
        <form action={logoutAction} className="absolute top-4 right-4">
          <button className="text-muted hover:text-foreground text-sm">
            Log out
          </button>
        </form>
      )}
      {children}
    </>
  );
}
