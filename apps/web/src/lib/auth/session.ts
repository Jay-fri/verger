import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
};

// Cheap check (JWT claims only, no Auth-server round trip) — good enough for
// "is anyone logged in at all" gating.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  return { id: data.claims.sub, email: typeof data.claims.email === "string" ? data.claims.email : "" };
}

export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  }
  return user;
}

// Stronger check for the two actions the spec explicitly gates on email
// verification (create church, accept invite): confirms against the Auth
// server directly rather than trusting that a session implies verification,
// in case a project ever has "Confirm email" turned off in Supabase.
export async function requireVerifiedUser(next?: string): Promise<CurrentUser> {
  const user = await requireUser(next);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user?.email_confirmed_at) {
    redirect("/verify-email");
  }

  return user;
}
