import { redirect } from "next/navigation";

// The Phase 0 diagnostic health-check UI lived here; superseded by the real
// home screen at /dashboard (which redirects unauthenticated users to
// /sign-in itself). The JSON health check remains at /api/health for actual
// uptime/ops monitoring — this route just isn't a page anyone should land
// on anymore.
export default function RootPage() {
  redirect("/dashboard");
}
