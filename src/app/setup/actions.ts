"use server";

import { redirect } from "next/navigation";
import { createAdmin, formString, getAdminHash } from "~/lib/auth";
import { setSession } from "~/lib/session";

export async function setupAction(
  _prev: unknown,
  formData: FormData,
): Promise<{ error: string } | void> {
  if (getAdminHash()) redirect("/login");

  const password = formString(formData, "password");
  const confirm = formString(formData, "confirm");
  if (password.length < 12)
    return { error: "Password must be at least 12 characters" };
  if (password !== confirm) return { error: "Passwords do not match" };

  try {
    await createAdmin(password);
  } catch {
    // Lost a race with a concurrent setup: the admin row now exists.
    redirect("/login");
  }
  await setSession("admin");
  redirect("/home");
}
