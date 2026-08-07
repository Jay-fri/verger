import { pgTable, serial, timestamp } from "drizzle-orm/pg-core";

// Infra-verification table only — proves the Next.js -> Drizzle -> Supabase
// Postgres path works end to end. Domain tables land in later build phases.
export const healthChecks = pgTable("health_checks", {
  id: serial("id").primaryKey(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
});
