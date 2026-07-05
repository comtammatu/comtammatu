import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@comtammatu/database/supabase/middleware";
import {
  buildAccessDeniedPath,
  canAccess,
  centralSiteBranchKindForRole,
  extractClaimsFromAccessToken,
  isAdminRole,
  isAdminRoutePath,
  isPublicAppPath,
  PERMISSION_KEYS,
  resolveModuleFromPath,
  resolvePostLoginRedirect,
  type BlockedStateReasonCode,
  type JwtClaims,
  type ModuleKey,
} from "@comtammatu/shared/auth";
import {
  resolveBranchHubContextFromHeaders,
  resolveCentralSiteHomeBranchId,
} from "@/_lib/branch-hub-device";
import { resolveLegacyEmployeeBranchRuntimePath } from "@/(protected)/employee/_lib/branch-runtime-redirect";
import { getClientIp } from "@lib/network/client-ip";

// Module-level flag — emit one warning per warm Edge instance when the POS
// network gate is disabled in production. Spec: regressions.md
// POS-NETWORK-GATE-GRACE-IS-SECURITY-CEILING ("kill-switch is loud, logged
// in proxy startup"). Vercel log drain captures this for SIEM ingestion.
let NETWORK_GATE_OFF_WARNED = false;

type BranchSurfaceGate = {
  branchKind: string | null;
  isActive: boolean | null;
};

// Per-warm-instance cache of the branch-surface gate lookup (POS/KDS/runner
// surfaces and central-site scope checks). Key includes tenant_id so an entry
// can never be reused across tenants. Value is null when no matching branch
// row exists for that tenant.
const BRANCH_SURFACE_CACHE = new Map<string, BranchSurfaceGate | null>();

type ProxySupabase = Awaited<ReturnType<typeof updateSession>>["supabase"];

async function getBranchSurface(
  supabase: ProxySupabase,
  tenantId: number,
  branchId: number,
): Promise<BranchSurfaceGate | null> {
  const branchSurfaceKey = `${String(tenantId)}:${String(branchId)}`;
  let branchSurface = BRANCH_SURFACE_CACHE.get(branchSurfaceKey);
  if (branchSurface === undefined) {
    const { data: branchRow } = await supabase
      .from("branches")
      .select("branch_kind, is_active")
      .eq("id", branchId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    branchSurface = branchRow
      ? {
          branchKind: (branchRow.branch_kind as string | undefined) ?? null,
          isActive:
            typeof branchRow.is_active === "boolean"
              ? branchRow.is_active
              : null,
        }
      : null;
    BRANCH_SURFACE_CACHE.set(branchSurfaceKey, branchSurface);
  }
  return branchSurface;
}

function branchSurfaceAllows(
  branchSurface: BranchSurfaceGate | null,
  requiredBranchKind: string | null,
): boolean {
  return (
    branchSurface !== null &&
    branchSurface.isActive === true &&
    (requiredBranchKind === null ||
      branchSurface.branchKind === requiredBranchKind)
  );
}

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

async function redirectToDefaultLanding(
  request: NextRequest,
  sessionResponse: NextResponse,
  supabase: ProxySupabase,
  claims: JwtClaims,
): Promise<NextResponse> {
  const branchHubContext = {
    ...resolveBranchHubContextFromHeaders(request.headers),
    homeBranchId: await resolveCentralSiteHomeBranchId(supabase, claims),
  };
  const url = new URL(
    resolvePostLoginRedirect(claims, null, branchHubContext),
    request.nextUrl.origin,
  );
  return redirectWithCookies(url, sessionResponse);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  // Login page: special handling.
  if (pathname === "/login") {
    if (request.method !== "GET" || request.headers.has("next-action")) {
      return response;
    }

    if (!session) return response; // unauthenticated → show login
    // Authenticated → bounce to role's post-login destination.
    if (claims) {
      const returnTo = request.nextUrl.searchParams.get("returnTo");
      const branchHubContext = {
        ...resolveBranchHubContextFromHeaders(request.headers),
        homeBranchId: await resolveCentralSiteHomeBranchId(supabase, claims),
      };
      const url = new URL(
        resolvePostLoginRedirect(claims, returnTo, branchHubContext),
        request.nextUrl.origin,
      );
      return redirectWithCookies(url, response);
    }
    return response;
  }

  // Not authenticated → send to login with returnTo preserved.
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
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

  // Old /employee entrypoints: branch-runtime roles are redirected to the
  // /br/{branchId} equivalent before module ACL runs. Central-site roles
  // (D055 §1) resolve their home site via the cached branch_kind lookup;
  // roles without operator_home access (office) fall through and keep using
  // /employee. Query string is preserved (payslip ?year, count ?location).
  if (pathname.startsWith("/employee")) {
    const branchRuntimePath = resolveLegacyEmployeeBranchRuntimePath(
      claims,
      pathname,
      await resolveCentralSiteHomeBranchId(supabase, claims),
    );
    if (branchRuntimePath) {
      const url = request.nextUrl.clone();
      url.pathname = branchRuntimePath;
      return redirectWithCookies(url, response);
    }
  }

  if (
    (pathname === "/br" || pathname === "/br/") &&
    claims.user_role !== "owner"
  ) {
    return redirectToDefaultLanding(request, response, supabase, claims);
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
        return redirectToDefaultLanding(request, response, supabase, claims);
      }

      return redirectToAccessDenied(
        request,
        response,
        "insufficient-permission",
      );
    }

    if (
      moduleKey === "inventory_procurement" &&
      claims.user_role !== "owner"
    ) {
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

    const pathMatch = pathname.match(/^\/br\/(\d+)(?:\/|$)/);
    if (pathMatch) {
      const routeBranchId = Number(pathMatch[1]);
      const allowCrossBranch = claims.user_role === "owner";
      // Central-site soft-routing (D055 §1): warehouse/production managers
      // keep tenant-level claims (branch_id null); instead of a claims match
      // they may enter /br/{id} ONLY when the target branch is active and its
      // branch_kind matches the role's central domain.
      const centralSiteKind =
        claims.branch_id === null
          ? centralSiteBranchKindForRole(claims.user_role)
          : null;

      if (
        !allowCrossBranch &&
        (claims.branch_id === null || claims.branch_id !== routeBranchId)
      ) {
        if (centralSiteKind === null) {
          return redirectToAccessDenied(
            request,
            response,
            "branch-scope-mismatch",
          );
        }
        const branchSurface = await getBranchSurface(
          supabase,
          claims.tenant_id,
          routeBranchId,
        );
        if (!branchSurfaceAllows(branchSurface, centralSiteKind)) {
          return redirectToAccessDenied(
            request,
            response,
            "branch-scope-mismatch",
          );
        }
      }

      const isStationRoute =
        moduleKey === "pos" || moduleKey === "kds" || moduleKey === "runner";
      const needsBranchSurface =
        isStationRoute || pathname.startsWith(`/br/${routeBranchId}/stock`);

      if (needsBranchSurface) {
        // Stations (POS/KDS/runner) stay branch-kind "branch" — central sites
        // have no POS. Owner enters any ACTIVE site's non-station surfaces
        // (D059 §3 context picker); central-site roles get their matching
        // kind ONLY for the non-station /br/{id}/stock surfaces.
        const requiredBranchKind = isStationRoute
          ? "branch"
          : allowCrossBranch
            ? null
            : (centralSiteKind ?? "branch");
        const branchSurface = await getBranchSurface(
          supabase,
          claims.tenant_id,
          routeBranchId,
        );
        if (!branchSurfaceAllows(branchSurface, requiredBranchKind)) {
          return redirectToAccessDenied(
            request,
            response,
            "branch-surface-restricted",
          );
        }
      }

      if (isStationRoute) {
        // Network gate: only devices sharing NAT egress IP with the branch's
        // print-agent (registered via /api/branch-presence) may load protected
        // POS/KDS branch surfaces. The exact Runner customer board path is public.
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
        // Owner reaches this point via allowCrossBranch (cover-ca) and is
        // intentionally subject to the same network gate: covering a shift
        // means being on the branch network. No owner bypass here.
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
            "[network-gate] disabled via POS_NETWORK_GATE=off — POS/KDS perimeter open. See regressions.md POS-NETWORK-GATE-GRACE-IS-SECURITY-CEILING.",
          );
          NETWORK_GATE_OFF_WARNED = true;
        }

        if (networkGateEnabled) {
          const clientIp = getClientIp(request.headers);
          const graceCutoff = new Date(Date.now() - 30 * 60_000).toISOString();
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
  } else if (isAdminRoutePath(pathname)) {
    // Admin route with no module mapping — redirect to default landing
    // to avoid serving admin pages without ACL enforcement.
    return redirectToDefaultLanding(request, response, supabase, claims);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
