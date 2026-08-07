import type { RouteDecision } from "./types";

/**
 * The confidence router: the single decision point between "put it on
 * screen automatically" and "queue it for an operator to confirm". Exact
 * matches always carry confidence 1, so any sane threshold auto-displays
 * them without special-casing here — the threshold alone is what a future
 * solo mode would lower to skip the human-confirm step entirely.
 */
export function routeByConfidence(confidence: number, autoDisplayThreshold: number): RouteDecision {
  return confidence >= autoDisplayThreshold ? "auto-display" : "needs-review";
}
