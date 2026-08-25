// Home screen's "This week" hero card — one button whose label/destination
// changes by state, computed from real conditions rather than guessed from
// date alone. See computeServiceState below for the exact rule per state.

export type ServiceHomeState = "not-started" | "in-prep" | "ready" | "live";

/** The upcoming Sunday at 00:00 local time (today, if today already is Sunday) — the default `scheduledFor` for a newly created service. */
export function nextSunday(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const daysUntilSunday = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + daysUntilSunday);
  return d;
}

function isServiceDay(scheduledFor: Date, now: Date = new Date()): boolean {
  return now >= scheduledFor;
}

/**
 * "Fully prepped" = the outline has at least one item (a translation is
 * always set today — church.defaultTranslation has a real default, WEB —
 * so that half of the original "outline has items and translation is set"
 * rule is currently unconditional; kept as an explicit parameter so it
 * still means something the day a church can plausibly have no usable
 * translation configured).
 */
export function computeServiceState(service: {
  status: "draft" | "live" | "ended";
  scheduledFor: Date;
  cueItemCount: number;
  hasTranslation: boolean;
} | null): ServiceHomeState {
  if (!service) return "not-started";
  if (service.status === "live") return "live";

  const fullyPrepped = service.cueItemCount >= 1 && service.hasTranslation;
  if (fullyPrepped && isServiceDay(service.scheduledFor)) return "ready";
  return "in-prep";
}
