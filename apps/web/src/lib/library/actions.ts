"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { hasRequiredRole } from "@verger/shared-types";
import { db } from "@/lib/db";
import { announcements, announcementSlides, customTexts, songs, songSections } from "@/lib/db/schema";
import { requireActiveMembership } from "@/lib/auth/membership";

// Same access rule as Prep in Phase 4: the content library is edited by
// operators/admins; volunteers can use it (cue it into a service, run it
// live) but not build it.
async function requireLibraryAccess(): Promise<{ churchId: string }> {
  const { membership } = await requireActiveMembership();
  if (!hasRequiredRole(membership.role, ["operator", "admin"])) {
    throw new Error("Only operators and admins can edit the content library.");
  }
  return { churchId: membership.church.id };
}

export type LibraryActionState = { error: string | null };

export async function createSongAction(
  _prevState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const { churchId } = await requireLibraryAccess();
  if (!db) return { error: "Database is not configured." };

  const title = String(formData.get("title") ?? "").trim();
  const labels = formData.getAll("sectionLabel").map(String);
  const lyrics = formData.getAll("sectionLyrics").map(String);

  if (!title) return { error: "Give the song a title." };

  const sections = labels
    .map((label, i) => ({ label: label.trim(), lyrics: (lyrics[i] ?? "").trim() }))
    .filter((s) => s.label && s.lyrics);
  if (sections.length === 0) {
    return { error: "Add at least one section (e.g. Verse 1) with lyrics." };
  }

  const [song] = await db.insert(songs).values({ churchId, title }).returning();
  await db.insert(songSections).values(
    sections.map((s, i) => ({ songId: song.id, position: i, label: s.label, lyrics: s.lyrics })),
  );

  redirect("/dashboard/library");
}

export async function deleteSongAction(songId: string): Promise<void> {
  const { churchId } = await requireLibraryAccess();
  if (!db) throw new Error("Database is not configured.");

  const song = await db.query.songs.findFirst({ where: eq(songs.id, songId) });
  if (!song || song.churchId !== churchId) throw new Error("Song not found.");

  await db.delete(songs).where(eq(songs.id, songId));
  revalidatePath("/dashboard/library");
}

export async function createAnnouncementAction(
  _prevState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const { churchId } = await requireLibraryAccess();
  if (!db) return { error: "Database is not configured." };

  const title = String(formData.get("title") ?? "").trim();
  const slideTexts = formData
    .getAll("slideText")
    .map(String)
    .map((t) => t.trim())
    .filter(Boolean);

  if (!title) return { error: "Give the announcement a title." };
  if (slideTexts.length === 0) return { error: "Add at least one slide." };

  const [announcement] = await db.insert(announcements).values({ churchId, title }).returning();
  await db.insert(announcementSlides).values(
    slideTexts.map((text, i) => ({ announcementId: announcement.id, position: i, text })),
  );

  redirect("/dashboard/library");
}

export async function deleteAnnouncementAction(announcementId: string): Promise<void> {
  const { churchId } = await requireLibraryAccess();
  if (!db) throw new Error("Database is not configured.");

  const announcement = await db.query.announcements.findFirst({
    where: eq(announcements.id, announcementId),
  });
  if (!announcement || announcement.churchId !== churchId) throw new Error("Announcement not found.");

  await db.delete(announcements).where(eq(announcements.id, announcementId));
  revalidatePath("/dashboard/library");
}

export async function createCustomTextAction(
  _prevState: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const { churchId } = await requireLibraryAccess();
  if (!db) return { error: "Database is not configured." };

  const title = String(formData.get("title") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();

  if (!title) return { error: "Give it a title." };
  if (!text) return { error: "Enter the text to display." };

  await db.insert(customTexts).values({ churchId, title, text });

  redirect("/dashboard/library");
}

export async function deleteCustomTextAction(customTextId: string): Promise<void> {
  const { churchId } = await requireLibraryAccess();
  if (!db) throw new Error("Database is not configured.");

  const item = await db.query.customTexts.findFirst({ where: eq(customTexts.id, customTextId) });
  if (!item || item.churchId !== churchId) throw new Error("Custom text not found.");

  await db.delete(customTexts).where(eq(customTexts.id, customTextId));
  revalidatePath("/dashboard/library");
}
