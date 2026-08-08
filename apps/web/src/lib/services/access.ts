import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { services } from "@/lib/db/schema";
import { requireActiveMembership } from "@/lib/auth/membership";

/**
 * Confirms the caller is an active member of the church that owns this
 * service. Any role (including volunteer) passes — running the Control
 * console is open to every role per the overview doc; Prep-specific actions
 * layer their own stricter operator/admin check on top of this.
 */
export async function requireServiceAccess(serviceId: string) {
  const { membership } = await requireActiveMembership();
  if (!db) throw new Error("Database is not configured.");

  const service = await db.query.services.findFirst({ where: eq(services.id, serviceId) });
  // Not found, or belongs to a different church — same error either way.
  if (!service || service.churchId !== membership.church.id) {
    throw new Error("Service not found.");
  }
  return { service, membership };
}
