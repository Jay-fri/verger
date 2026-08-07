import { relations } from "drizzle-orm";
import { pgEnum, pgSchema, pgTable, serial, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { CHURCH_ROLES, INVITE_STATUSES } from "@verger/shared-types";

// Infra-verification table only — proves the Next.js -> Drizzle -> Supabase
// Postgres path works end to end. Domain tables land in later build phases.
export const healthChecks = pgTable("health_checks", {
  id: serial("id").primaryKey(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
});

// Reference-only model of Supabase's auth.users table, so church tables can
// declare a real FK against it. Deliberately NOT exported: drizzle-kit scans
// every exported pgTable in this file to decide what to create, and Supabase
// (not us) owns and manages auth.users — schemaFilter alone doesn't stop
// drizzle-kit from emitting a CREATE TABLE for it if the table object is
// visible on the module. Keeping it module-private still lets the tables
// below reference `authUsers.id` for a real FK constraint.
const authSchema = pgSchema("auth");
const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

export const churchRoleEnum = pgEnum("church_role", CHURCH_ROLES);
export const inviteStatusEnum = pgEnum("invite_status", INVITE_STATUSES);

// Mirrors auth.users (id, email, display name) into the public schema via a
// database trigger (see drizzle/0002_profiles_trigger_and_rls.sql) — the
// standard Supabase pattern, since application code should never query
// auth.users directly.
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  fullName: text("full_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// The top-level tenant. Services, cue lists, and Bible data preferences all
// belong to a church, never directly to a user.
export const churches = pgTable("churches", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  defaultTranslation: text("default_translation").notNull().default("ESV"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// A user's role within one church. A user with no rows here has no church.
// A user with exactly one row is the common case (including solo/one-person
// churches) — nothing in this model assumes a multi-person team.
export const churchMembers = pgTable(
  "church_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    churchId: uuid("church_id")
      .notNull()
      .references(() => churches.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: churchRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique("church_members_church_user_unique").on(table.churchId, table.userId)],
);

// A pending (or resolved) invitation for someone to join a church at a given
// role. Email sending isn't wired up yet — see the TODO in the invite Server
// Action — so for now the invite link itself is the deliverable.
export const churchInvites = pgTable("church_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  churchId: uuid("church_id")
    .notNull()
    .references(() => churches.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: churchRoleEnum("role").notNull(),
  token: text("token").notNull().unique(),
  invitedBy: uuid("invited_by")
    .notNull()
    .references(() => authUsers.id),
  status: inviteStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});

export const churchesRelations = relations(churches, ({ many }) => ({
  members: many(churchMembers),
  invites: many(churchInvites),
}));

export const churchMembersRelations = relations(churchMembers, ({ one }) => ({
  church: one(churches, { fields: [churchMembers.churchId], references: [churches.id] }),
  profile: one(profiles, { fields: [churchMembers.userId], references: [profiles.id] }),
}));

export const churchInvitesRelations = relations(churchInvites, ({ one }) => ({
  church: one(churches, { fields: [churchInvites.churchId], references: [churches.id] }),
}));
