import { getHealthStatus } from "@/lib/health";

// Health status must be checked live per request, not baked in at build time.
export const dynamic = "force-dynamic";

const DB_STATUS_LABEL: Record<string, string> = {
  connected: "Connected",
  not_configured: "Not configured",
  error: "Error",
};

const DB_STATUS_COLOR: Record<string, string> = {
  connected: "bg-confident",
  not_configured: "bg-needs-review",
  error: "bg-danger",
};

export default async function HealthCheckPage() {
  const health = await getHealthStatus();

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center p-8">
      <main className="w-full max-w-lg rounded-xl border border-border bg-surface p-8 shadow-sm">
        <p className="text-sm font-medium tracking-wide text-accent-gold uppercase">Verger</p>
        <h1 className="mt-1 text-2xl font-semibold text-text-primary">System health check</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Phase 0 scaffolding — Next.js, Supabase, and Drizzle wiring.
        </p>

        <dl className="mt-6 space-y-4 border-t border-border pt-6">
          <div className="flex items-center justify-between">
            <dt className="text-sm text-text-secondary">App</dt>
            <dd className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <span className="h-2 w-2 rounded-full bg-confident" />
              Running
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-sm text-text-secondary">
              Database (Supabase Postgres via Drizzle)
            </dt>
            <dd className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <span className={`h-2 w-2 rounded-full ${DB_STATUS_COLOR[health.db]}`} />
              {DB_STATUS_LABEL[health.db]}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-sm text-text-secondary">Checked at</dt>
            <dd className="text-sm font-medium text-text-primary">{health.timestamp}</dd>
          </div>
        </dl>

        {health.dbError && (
          <p className="mt-4 rounded-lg border border-border bg-background p-3 text-xs text-text-secondary">
            {health.dbError}
          </p>
        )}

        {health.db === "not_configured" && (
          <p className="mt-4 text-xs text-text-secondary">
            Copy <code>apps/web/.env.example</code> to <code>apps/web/.env.local</code> and add
            your Supabase project&apos;s connection details to see this go green.
          </p>
        )}

        <p className="mt-6 text-xs text-text-secondary">
          JSON version at{" "}
          <a href="/api/health" className="text-accent-gold underline">
            /api/health
          </a>
        </p>
      </main>
    </div>
  );
}
