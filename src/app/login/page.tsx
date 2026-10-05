import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminHash } from "~/lib/auth";
import { AuthForm } from "./auth-form";
import { loginAction } from "./actions";

export const metadata: Metadata = { title: "Sign In — VoltOps" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  if (!getAdminHash()) redirect("/setup");
  return <AuthForm title="Sign in to VoltOps" action={loginAction} />;
}
