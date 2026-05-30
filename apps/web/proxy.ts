import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@comtammatu/database/supabase/middleware";
import {
  buildAccessDeniedPath,
  canAccess,
  extractClaimsFromAccessToken,
  isAdminRole,
  isAdminRoutePath,
  isBetaPath,
  isFeedbackPublicPath,
  isPublicAppPath,
  normalizeHost,
  PERMISSION_KEYS,
  resolveHostSurface,
  resolveLegacyRouteRedirectPath,
  resolveModuleFromPath,
  resolvePostLoginRedirect,
  stripBetaPrefix,
  type AuthSurface,
  type BlockedStateReasonCode,
  type JwtClaims,
  type ModuleKey,
} from "@comtammatu/shared/auth";
import { getClientIp } from "@lib/network/client-ip";

// Module-level flag — emit one warning per warm Edge instance when the POS
// network gate is disabled in production. Spec: regressions.md
// POS-NETWORK-GATE-GRACE-IS-SECURITY-CEILING ("kill-switch is loud, logged
// in proxy startup"). Vercel log drain captures this for SIEM ingestion.
let NETWORK_GATE_OFF_WARNED = false;

// Module-level flag — warn once per warm Edge instance when production runs
// without NEXT_PUBLIC_FEEDBACK_HOST set. Without it, /r/* shares origin with
// admin → cookie/SW/CSP boundary collapses. Mirrors POS network gate pattern.
let FEEDBACK_HOST_UNSET_WARNED = false;

/** Create a redirect that preserves Set-Cookie from updateSession response */
function redirectWithCookies(
  url: URL,
  sessionResponse: NextResponse,
): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of sessionResponse.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

function redirectToAccessDenied(
  request: NextRequest,
  sessionResponse: NextResponse,
  reason: BlockedStateReasonCode,
): NextResponse {
  const from = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const url = new URL(
    buildAccessDeniedPath(reason, { from }),
    request.nextUrl.origin,
  );
  return redirectWithCookies(url, sessionResponse);
}

function redirectToDefaultLanding(
  request: NextRequest,
  sessionResponse: NextResponse,
  claims: JwtClaims,
  surface: AuthSurface,
): NextResponse {
  const url = new URL(
    resolvePostLoginRedirect(claims, null, { surface }),
    request.nextUrl.origin,
  );
  return redirectWithCookies(url, sessionResponse);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Host gate (Auth v2 + feedback isolation) — runs BEFORE auth/public-path
  // checks so the public feedback host cannot serve admin routes even though
  // proxy short-circuits `isPublicAppPath`. Single chokepoint; downstream
  // layouts/pages MUST NOT re-implement this.
  //
  // Opt-in via env: when NEXT_PUBLIC_FEEDBACK_HOST is unset, gate is a no-op
  // and behaviour matches pre-split (single host serves both surfaces). Set
  // both NEXT_PUBLIC_FEEDBACK_HOST and NEXT_PUBLIC_APP_HOST in production to
  // enforce origin isolation between /r/* (public) and admin/POS.
  const feedbackHost = process.env.NEXT_PUBLIC_FEEDBACK_HOST;
  const appHost = process.env.NEXT_PUBLIC_APP_HOST;
  const hostHeader = request.headers.get("host");
  const hostSurface = resolveHostSurface(hostHeader, {
    feedbackHost,
    appHost,
  });

  // Loud warning once per warm Edge instance when production runs without the
  // feedback host configured. Mirrors POS network gate kill-switch pattern.
  if (
    process.env.NODE_ENV === "production" &&
    !feedbackHost &&
    !FEEDBACK_HOST_UNSET_WARNED
  ) {
    console.warn(
      "[host-gate] NEXT_PUBLIC_FEEDBACK_HOST unset in production — feedback /r/* shares origin with admin app. See regressions.md FEEDBACK-HOST-SPLIT-COOKIE-DOMAIN-MUST-BE-HOST-ONLY.",
    );
    FEEDBACK_HOST_UNSET_WARNED = true;
  }

  if (hostSurface === "feedback") {
    // Feedback host: only `/r/*` is reachable. Everything else (admin, login,
    // /api/*, /sw.js, /manifest.webmanifest, /favicon-related root) returns
    // 404 — admin paths must not enumerate on the public origin.
    if (!isFeedbackPublicPath(pathname)) {
      return new NextResponse(null, { status: 404 });
    }
    // /r/* on feedback host — bypass auth + skip session refresh entirely so
    // no `sb-*-auth-token` cookie is ever set on the feedback origin.
    return NextResponse.next();
  }

  if (hostSurface === "app" && feedbackHost && isFeedbackPublicPath(pathname)) {
    // App host receiving /r/* (e.g. legacy printed QR or shared link) →
    // 308 to feedback host so the canonical origin serves the form. 308 keeps
    // method + body so any future POST to /r/<token> redirects intact.
    const target = new URL(
      pathname + request.nextUrl.search,
      `https://${normalizeHost(feedbackHost) ?? feedbackHost}`,
    );
    return NextResponse.redirect(target, 308);
  }

  const surface: AuthSurface = isBetaPath(pathname) ? "beta" : "legacy";

  // Public paths — skip auth. Includes `/access-denied` so the page can render
  // for any authenticated-but-blocked user without re-entering the ACL loop.
  if (isPublicAppPath(pathname)) {
    return NextResponse.next();
  }

  // /api/branch-presence is a Bearer-token endpoint (print-agent heartbeat).
  // Skip session-based auth so unauthenticated agent requests reach the route
  // handler's timing-safe token check instead of being redirected to /login.
  if (pathname === "/api/branch-presence") {
    return NextResponse.next();
  }

  // /api/cron/* are Vercel-cron entrypoints. Each handler enforces its own
  // Bearer CRON_SECRET (timing-safe). Skipping session auth here is what
  // keeps `vercel-cron/1.0` requests (no cookies) from being 307'd to /login
  // before they reach the handler's token check.
  if (pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  // Read session — cookie decode + auto-refresh via setAll callback when the
  // access token is past EXPIRY_MARGIN_MS. Single read across login bounce +
  // route ACL: `session` is the authenticated marker (truthy) AND carries the
  // access_token used to decode claims locally. Avoid `session.user.*` reads —
  // @supabase/auth-js wraps it in insecureUserWarningProxy on the server.
  // Spec: regressions.md PROXY-NEVER-CALL-GETUSER. Banned-user revocation
  // lives in Server Actions via getAuthContext (apps/web/app/_lib/auth.ts).
  const { session, response, supabase } = await updateSession(request);
  const claims = extractClaimsFromAccessToken(session?.access_token);

  const legacyRedirectPath = resolveLegacyRouteRedirectPath(pathname);
  if (legacyRedirectPath) {
    const url = request.nextUrl.clone();
    url.pathname = legacyRedirectPath;
    return redirectWithCookies(url, response);
  }

  // Login page: special handling.
  if (pathname === "/login" || pathname === "/beta/login") {
    if (request.method !== "GET" || request.headers.has("next-action")) {
      return response;
    }

    if (!session) return response; // unauthenticated → show login
    // Authenticated → bounce to role's post-login destination.
    if (claims) {
      const returnTo = request.nextUrl.searchParams.get("returnTo");
      const url = new URL(
        resolvePostLoginRedirect(claims, returnTo, { surface }),
        request.nextUrl.origin,
      );
      return redirectWithCookies(url, response);
    }
    return response;
  }

  // Not authenticated → send to login with returnTo preserved.
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = surface === "beta" ? "/beta/login" : "/login";
    url.search = "";
    url.searchParams.set(
      "returnTo",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return redirectWithCookies(url, response);
  }

  // Authenticated — verify claims + module ACL. Blocked operational routes go
  // to `/access-denied`; disallowed Admin routes go to the role's default
  // landing page. Proxy is the single gate: layouts and pages downstream MUST
  // NOT re-check these invariants.
  //
  // Claims were decoded above from the JWT access_token, NOT from
  // `user.app_metadata`. Supabase-js reads `user.app_metadata` from the
  // `auth.users` row, which does not include hook-injected claims like
  // `user_role` or `position`.
  if (!claims) {
    return redirectToAccessDenied(request, response, "missing-auth-context");
  }

  // Module ACL: each route resolves to a ModuleKey, and the user's role
  // must be in that module's allowedRoles. Admin routes that fail ACL
  // redirect to the role's default landing page; non-admin routes redirect
  // to /access-denied.
  const moduleKey: ModuleKey | null = resolveModuleFromPath(pathname);
  if (moduleKey) {
    if (!canAccess(claims.user_role, moduleKey)) {
      if (
        isAdminRoutePath(pathname) ||
        (moduleKey === "employee" && isAdminRole(claims.user_role))
      ) {
        return redirectToDefaultLanding(request, response, claims, surface);
      }

      return redirectToAccessDenied(
        request,
        response,
        "insufficient-permission",
      );
    }

    if (moduleKey === "inventory_procurement") {
      const { data: canReadProcurement, error } = await supabase.rpc(
        "has_permission_any",
        { p_key: PERMISSION_KEYS.PROCUREMENT_READ },
      );
      if (error || canReadProcurement !== true) {
        return redirectToAccessDenied(
          request,
          response,
          "insufficient-permission",
        );
      }
    }

    // Branch-scoped routes (POS/KDS + branch_settings + menu-limits) enforce
    // URL branchId matches the user's assigned branch_id. Admin-level roles
    // (owner/super_manager/area_manager) may traverse any branch's settings.
    // POS/KDS also require the branch be operational (not warehouse/central_kitchen).
    if (
      moduleKey === "pos" ||
      moduleKey === "kds" ||
      moduleKey === "runner" ||
      moduleKey === "branch_settings" ||
      moduleKey === "branch_menu_limits"
    ) {
      const routePath =
        surface === "beta" ? stripBetaPrefix(pathname) : pathname;
      const pathMatch = routePath.match(/^\/br\/(\d+)\//);
      if (pathMatch) {
        const routeBranchId = Number(pathMatch[1]);

        const crossBranchRoles: readonly string[] = [
          "owner",
          "super_manager",
          "area_manager",
        ];
        const allowCrossBranch =
          (moduleKey === "branch_settings" ||
            moduleKey === "branch_menu_limits") &&
          crossBranchRoles.includes(claims.user_role);

        if (
          !allowCrossBranch &&
          (claims.branch_id === null || claims.branch_id !== routeBranchId)
        ) {
          return redirectToAccessDenied(
            request,
            response,
            "branch-scope-mismatch",
          );
        }

        if (
          moduleKey === "pos" ||
          moduleKey === "kds" ||
          moduleKey === "runner"
        ) {
          const { data: branchRow } = await supabase
            .from("branches")
            .select("id, branch_kind")
            .eq("id", routeBranchId)
            .eq("tenant_id", claims.tenant_id)
            .maybeSingle();
          const kind = branchRow?.branch_kind;
          if (
            branchRow &&
            (kind === "central_warehouse" || kind === "central_kitchen")
          ) {
            return redirectToAccessDenied(
              request,
              response,
              "central-warehouse-branch-restricted",
            );
          }

          // Network gate: only devices sharing NAT egress IP with the branch's
          // print-agent (registered via /api/branch-presence) may load POS/KDS/Runner.
          // Defense-in-depth ONLY — RLS + JWT remain the source of truth for
          // data access (PostgREST direct calls bypass this gate). Kill-switch
          // via POS_NETWORK_GATE=off for incident response.
          //
          // Auto-bypassed in non-production NODE_ENV (dev / test) — localhost
          // requests resolve to 127.0.0.1 which getClientIp() correctly rejects
          // as a private range, so without this skip every dev request would
          // 307 to /access-denied. Vercel preview deploys run as production;
          // set POS_NETWORK_GATE=off on those if you don't want the gate there.
          //
          // Admin roles already fail the branch-scope check above (their
          // branch_id is null), so they never reach this point — no explicit
          // bypass needed here.
          const networkGateEnabled =
            process.env.NODE_ENV === "production" &&
            process.env.POS_NETWORK_GATE !== "off";

          // Loud kill-switch: emit one warning per warm Edge instance when
          // POS_NETWORK_GATE=off in production. SIEM/log-drain ingests this
          // for alerting. Implements regressions.md
          // POS-NETWORK-GATE-GRACE-IS-SECURITY-CEILING.
          if (
            !networkGateEnabled &&
            process.env.NODE_ENV === "production" &&
            process.env.POS_NETWORK_GATE === "off" &&
            !NETWORK_GATE_OFF_WARNED
          ) {
            console.warn(
              "[network-gate] disabled via POS_NETWORK_GATE=off — POS/KDS/Runner perimeter open. See regressions.md POS-NETWORK-GATE-GRACE-IS-SECURITY-CEILING.",
            );
            NETWORK_GATE_OFF_WARNED = true;
          }

          if (networkGateEnabled) {
            const clientIp = getClientIp(request.headers);
            const graceCutoff = new Date(
              Date.now() - 30 * 60_000,
            ).toISOString();
            let trusted = false;
            if (clientIp) {
              const { data: trustRow } = await supabase
                .from("branch_trusted_egress_ips")
                .select("id")
                .eq("branch_id", routeBranchId)
                .eq("tenant_id", claims.tenant_id)
                .eq("ip_address", clientIp)
                .is("revoked_at", null)
                .gte("last_seen_at", graceCutoff)
                .maybeSingle();
              trusted = trustRow !== null;
            }
            if (!trusted) {
              return redirectToAccessDenied(
                request,
                response,
                "untrusted-network",
              );
            }
          }
        }
      }
    }
  } else if (isAdminRoutePath(pathname)) {
    // Admin route with no module mapping — redirect to default landing
    // to avoid serving admin pages without ACL enforcement.
    return redirectToDefaultLanding(request, response, claims, surface);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
