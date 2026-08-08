"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { churches } from "@/lib/db/schema";
import { requireActiveMembership } from "@/lib/auth/membership";

export type SettingsActionState = { error: string | null };

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
