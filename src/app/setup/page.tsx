import { redirect } from "next/navigation";
import { getAdminHash } from "~/lib/auth";
import { AuthForm } from "~/app/login/auth-form";
import { setupAction } from "./actions";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (getAdminHash()) redirect("/login");
  return (
    <AuthForm
      title="Create admin password"
      hint="At least 12 characters."
      action={setupAction}
      confirm
    />
  );
}
