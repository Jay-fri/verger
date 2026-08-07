# infra

Deployment and environment configuration for Verger.

- Web app deploys to **Vercel**, connected directly to the GitHub repo (auto-deploy on push to `main`).
- Database, auth, and realtime sync run on **Supabase**. Project connection details go in `apps/web/.env.local` (see `apps/web/.env.example`).
- Nothing here yet beyond this note — actual deploy config (Vercel project settings, Supabase migrations CI, etc.) gets added as later phases need it.
