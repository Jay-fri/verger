import { asc, eq } from "drizzle-orm";
import { hasRequiredRole } from "@verger/shared-types";
import { requireActiveMembership } from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { announcements, customTexts, songs } from "@/lib/db/schema";
import {
  deleteAnnouncementAction,
  deleteCustomTextAction,
  deleteSongAction,
} from "@/lib/library/actions";
import { SongForm } from "./song-form";
import { AnnouncementForm } from "./announcement-form";
import { CustomTextForm } from "./custom-text-form";
import { DeleteButton } from "./delete-button";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const { membership } = await requireActiveMembership();
  const allowed = hasRequiredRole(membership.role, ["operator", "admin"]);

  if (!allowed) {
    return (
      <div className="border-live/40 bg-live/10 rounded-xl border p-6">
        <h1 className="text-live text-lg font-semibold">Access restricted</h1>
        <p className="mt-2 text-sm text-text-primary">
          The content library requires the operator or admin role. You&apos;re signed in as{" "}
          <strong>{membership.role}</strong>.
        </p>
      </div>
    );
  }

  const [churchSongs, churchAnnouncements, churchCustomTexts] = db
    ? await Promise.all([
        db.query.songs.findMany({
          where: eq(songs.churchId, membership.church.id),
          with: { sections: { orderBy: (fields, { asc: ord }) => [ord(fields.position)] } },
          orderBy: [asc(songs.createdAt)],
        }),
        db.query.announcements.findMany({
          where: eq(announcements.churchId, membership.church.id),
          with: { slides: { orderBy: (fields, { asc: ord }) => [ord(fields.position)] } },
          orderBy: [asc(announcements.createdAt)],
        }),
        db.query.customTexts.findMany({
          where: eq(customTexts.churchId, membership.church.id),
          orderBy: [asc(customTexts.createdAt)],
        }),
      ])
    : [[], [], []];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Content library</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Songs, announcements, and custom text — reusable across services. Cue them into a
          service&apos;s outline from Prep.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">Songs</h2>
        {churchSongs.length > 0 && (
          <ul className="mt-4 space-y-3">
            {churchSongs.map((song) => (
              <li key={song.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-text-primary">{song.title}</p>
                  <DeleteButton onDelete={deleteSongAction.bind(null, song.id)} />
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  {song.sections.map((s) => s.label).join(" · ") || "No sections"}
                </p>
              </li>
            ))}
          </ul>
        )}
        <SongForm />
      </section>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">
          Announcements
        </h2>
        {churchAnnouncements.length > 0 && (
          <ul className="mt-4 space-y-3">
            {churchAnnouncements.map((announcement) => (
              <li
                key={announcement.id}
                className="rounded-lg border border-border bg-background p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-text-primary">{announcement.title}</p>
                  <DeleteButton onDelete={deleteAnnouncementAction.bind(null, announcement.id)} />
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  {announcement.slides.length} slide{announcement.slides.length === 1 ? "" : "s"}
                </p>
              </li>
            ))}
          </ul>
        )}
        <AnnouncementForm />
      </section>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">
          Custom text
        </h2>
        {churchCustomTexts.length > 0 && (
          <ul className="mt-4 space-y-3">
            {churchCustomTexts.map((item) => (
              <li key={item.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-text-primary">{item.title}</p>
                  <DeleteButton onDelete={deleteCustomTextAction.bind(null, item.id)} />
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-text-secondary">{item.text}</p>
              </li>
            ))}
          </ul>
        )}
        <CustomTextForm />
      </section>
    </div>
  );
}
