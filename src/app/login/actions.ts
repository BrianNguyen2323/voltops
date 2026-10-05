"use server";

import { redirect } from "next/navigation";
import { formString, getAdminHash, verifyPassword } from "~/lib/auth";
import { clearSession, setSession } from "~/lib/session";

export async function loginAction(
  _prev: unknown,
  formData: FormData,
): Promise<{ error: string } | void> {
  const hash = getAdminHash();
  const ok =
    hash && (await verifyPassword(hash, formString(formData, "password")));
  if (!ok) return { error: "Incorrect password" };
  await setSession("admin");
  redirect("/home");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
