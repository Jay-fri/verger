import { db } from "@/lib/db";
import { healthChecks } from "@/lib/db/schema";

export type HealthStatus = {
  status: "ok";
  timestamp: string;
  db: "connected" | "not_configured" | "error";
  dbError?: string;
};

export async function getHealthStatus(): Promise<HealthStatus> {
  const result: HealthStatus = {
    status: "ok",
    timestamp: new Date().toISOString(),
    db: "not_configured",
  };

  if (!db) return result;

  try {
    await db.insert(healthChecks).values({});
    result.db = "connected";
  } catch (err) {
    result.db = "error";
    result.dbError = err instanceof Error ? err.message : "Unknown error";
  }

  return result;
}
