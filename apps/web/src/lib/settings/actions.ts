"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { BIBLE_TRANSLATIONS } from "@verger/shared-types";
import { db } from "@/lib/db";
import { churches } from "@/lib/db/schema";
import { requireActiveMembership } from "@/lib/auth/membership";

export type SettingsActionState = { error: string | null };

const TRANSLATION_CODES = new Set<string>(BIBLE_TRANSLATIONS.map((t) => t.code));

/**
 * Changes the church's default translation — what a new Control console
 * session starts on (the operator can still switch live, per-session, from
 * there; this only changes the starting point for sessions after this).
 * Doesn't touch any service already running.
 */
export async function updateChurchDefaultTranslationAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const { membership } = await requireActiveMembership();
  if (membership.role !== "admin") {
    return { error: "Only admins can change the default translation." };
  }
  if (!db) {
    return { error: "Database is not configured." };
  }

  const translation = String(formData.get("translation") ?? "");
  if (!TRANSLATION_CODES.has(translation)) {
    return { error: "Choose a translation." };
  }

  await db.update(churches).set({ defaultTranslation: translation }).where(eq(churches.id, membership.church.id));
  revalidatePath("/dashboard/settings");
  return { error: null };
}

// Rough cap matching the client-side check in logo-upload-form.tsx (500KB
// of image data becomes ~666KB once base64-encoded) plus headroom for the
// "data:image/png;base64," prefix — a defense-in-depth backstop, not the
// primary enforcement (a client could bypass its own JS, but can't bypass
// this).
const MAX_LOGO_DATA_URL_LENGTH = 750_000;

/**
 * Stores the church logo as a data: URL directly on the churches row —
 * deliberately not a Supabase Storage upload (see the schema comment on
 * churches.logoDataUrl for why). Used by the Stage output's "Logo" panic
 * button.
 */
export async function updateChurchLogoAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const { membership } = await requireActiveMembership();
  if (membership.role !== "admin") {
    return { error: "Only admins can change the church logo." };
  }
  if (!db) {
    return { error: "Database is not configured." };
  }

  const dataUrl = String(formData.get("logoDataUrl") ?? "").trim();
  if (!dataUrl.startsWith("data:image/")) {
    return { error: "Choose an image file." };
  }
  if (dataUrl.length > MAX_LOGO_DATA_URL_LENGTH) {
    return { error: "That image is too large — please use something under ~500KB." };
  }

  await db.update(churches).set({ logoDataUrl: dataUrl }).where(eq(churches.id, membership.church.id));
  revalidatePath("/dashboard/settings");
  return { error: null };
}

export async function removeChurchLogoAction(): Promise<void> {
  const { membership } = await requireActiveMembership();
  if (membership.role !== "admin") {
    throw new Error("Only admins can change the church logo.");
  }
  if (!db) throw new Error("Database is not configured.");

  await db.update(churches).set({ logoDataUrl: null }).where(eq(churches.id, membership.church.id));
  revalidatePath("/dashboard/settings");
}
