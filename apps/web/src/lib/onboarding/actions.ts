"use server";

import { redirect } from "next/navigation";
import { BIBLE_TRANSLATIONS, type BibleTranslationCode } from "@verger/shared-types";
import { db } from "@/lib/db";
import { churches, churchMembers } from "@/lib/db/schema";
import { requireVerifiedUser } from "@/lib/auth/session";
import { getActiveMembership } from "@/lib/auth/membership";

export type CreateChurchState = { error: string | null };

const TRANSLATION_CODES = new Set<string>(BIBLE_TRANSLATIONS.map((t) => t.code));

export async function createChurchAction(
  _prevState: CreateChurchState,
  formData: FormData,
): Promise<CreateChurchState> {
  const user = await requireVerifiedUser("/onboarding");

  // Onboarding is for first-time setup only — don't let an already-onboarded
  // user create a second church from this form.
  const existing = await getActiveMembership(user.id);
  if (existing) {
    redirect("/dashboard");
  }

  const name = String(formData.get("name") ?? "").trim();
  const translation = String(formData.get("translation") ?? "");

  if (!name) {
    return { error: "Church name is required." };
  }
  if (!TRANSLATION_CODES.has(translation)) {
    return { error: "Choose a translation." };
  }
  if (!db) {
    return { error: "Database is not configured." };
  }

  const [church] = await db
    .insert(churches)
    .values({ name, defaultTranslation: translation as BibleTranslationCode })
    .returning();

  await db.insert(churchMembers).values({
    churchId: church.id,
    userId: user.id,
    role: "admin",
  });

  redirect("/dashboard");
}
