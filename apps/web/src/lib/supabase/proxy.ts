import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Routes reachable while logged out. Everything else redirects to /sign-in.
// Role-based checks (admin/operator/volunteer) happen deeper, per-page —
// see requireChurchRole() in src/lib/auth/membership.ts. Proxy only decides
// "logged in or not"; it never queries the database.
// /stage is the Stage output route — deliberately public (see its own
// page.tsx and drizzle/0008_live_state_realtime_and_rls.sql for why): it's
// meant to be pointed at by vMix's Browser Source, which has no way to
// carry a login session. /monitor (the Stage confidence monitor — a
// second, pastor/band-facing screen) is public for the same reason: it's
// meant to run unattended on a physical screen with no one there to log in.
const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/auth", "/invite", "/stage", "/monitor"];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Without env vars configured yet, don't block every request — Phase 0's
  // health check should still work before Supabase Auth is wired up.
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not add code between createServerClient and getClaims() — this call
  // both validates the JWT and triggers the token refresh that gets written
  // back to cookies via setAll above. Skipping it causes random logouts.
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = data?.claims != null;

  const { pathname } = request.nextUrl;

  if (!isAuthenticated && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthenticated && (pathname === "/sign-in" || pathname === "/sign-up")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
