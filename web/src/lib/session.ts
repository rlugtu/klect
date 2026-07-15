import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** Returns { session, user } or null. Safe to call from any server component. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Redirects to /login if there is no session; otherwise returns the user. */
export async function requireUser() {
  const data = await getSession();
  if (!data) redirect("/login");
  return data.user;
}

/**
 * Like requireUser, but also enforces that the profile has been completed.
 * We treat a set handle as the "onboarded" signal.
 */
export async function requireOnboardedUser() {
  const user = await requireUser();
  if (!user.handle) redirect("/onboarding");
  return user;
}
