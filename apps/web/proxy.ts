import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@comtammatu/database/supabase/middleware";
import {
  BRANCH_REQUIRED_OPERATIONAL_ROLES,
  buildAccessDeniedPath,
  canAccess,
  canonicalizeSelfServicePath,
  extractClaimsFromAccessToken,
  isOwnerRoutePath,
  isPublicAppPath,
  PERMISSION_KEYS,
  requiredOperatorBranchKindForRole,
  resolveModuleFromPath,
  resolvePostLoginRedirect,
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

type BranchSurfaceGate = {
  branchKind: string | null;
  isActive: boolean | null;
};

// Per-warm-instance cache of the branch-surface gate lookup (POS/KDS/pickup
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

function redirectToDefaultLanding(
  request: NextRequest,
  sessionResponse: NextResponse,
  claims: JwtClaims,
): NextResponse {
  const url = new URL(
    resolvePostLoginRedirect(claims, null),
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
      const url = new URL(
        resolvePostLoginRedirect(claims, null),
        request.nextUrl.origin,
      );
      return redirectWithCookies(url, response);
    }
    return response;
  }

  // Not authenticated → send to login.
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return redirectWithCookies(url, response);
  }

  // Authenticated — verify claims + module ACL. Blocked operational routes go
  // to `/access-denied`; disallowed Owner routes go to the role's
  // default landing page. Proxy is the single gate: layouts and pages downstream MUST
  // NOT re-check these invariants.
  //
  // Claims were decoded above from the JWT access_token, NOT from
  // `user.app_metadata`. Supabase-js reads `user.app_metadata` from the
  // `auth.users` row, which does not include hook-injected claims like
  // `user_role` or `position`.
  if (!claims) {
    return redirectToAccessDenied(request, response, "missing-auth-context");
  }

  const isSelfServicePath =
    pathname === "/me" || pathname.startsWith("/me/");

  if (claims.user_role === "self_service" || isSelfServicePath) {
    const { data: canOpenSelfService, error: selfServiceGateError } =
      await supabase.rpc("has_permission", {
        p_branch_id: null as unknown as number,
        p_key: PERMISSION_KEYS.SELF_ACCESS,
      });
    if (selfServiceGateError || canOpenSelfService !== true) {
      return redirectToAccessDenied(
        request,
        response,
        "insufficient-permission",
      );
    }
  }

  if (
    isSelfServicePath &&
    BRANCH_REQUIRED_OPERATIONAL_ROLES.includes(claims.user_role)
  ) {
    if (claims.branch_id == null) {
      return redirectToAccessDenied(
        request,
        response,
        "branch-scope-mismatch",
      );
    }
    const branchSurface = await getBranchSurface(
      supabase,
      claims.tenant_id,
      claims.branch_id,
    );
    if (
      !branchSurfaceAllows(
        branchSurface,
        requiredOperatorBranchKindForRole(claims.user_role),
      )
    ) {
      return redirectToAccessDenied(
        request,
        response,
        "branch-surface-restricted",
      );
    }
  }

  if (isSelfServicePath) {
    const canonicalPath = canonicalizeSelfServicePath(
      claims,
      `${pathname}${request.nextUrl.search}`,
    );
    if (
      canonicalPath !== null &&
      canonicalPath !== `${pathname}${request.nextUrl.search}`
    ) {
      return redirectWithCookies(
        new URL(canonicalPath, request.nextUrl.origin),
        response,
      );
    }
  }

  if (pathname === "/hr" || pathname.startsWith("/hr/")) {
    const requiredCapability = pathname.startsWith("/hr/payroll")
      ? PERMISSION_KEYS.HR_PAYROLL_PREPARE
      : pathname.includes("/permissions") ||
          pathname.startsWith("/hr/staff/audit")
        ? PERMISSION_KEYS.AUTH_BINDING_READ
        : PERMISSION_KEYS.HR_VIEW_EMPLOYEE;
    const { data: canOpenHr, error: hrGateError } = await supabase.rpc(
      "has_permission",
      { p_branch_id: null as unknown as number, p_key: requiredCapability },
    );
    if (hrGateError || canOpenHr !== true) {
      return redirectToDefaultLanding(request, response, claims);
    }
  }

  // Control home (`/`): MODULE_ACL.owner JWT roles, plus HR Control bindings.
  // HR Control = JWT `self_service` + tenant `hr:view_employee` (same as login).
  // Branch-floor roles also hold `hr:view_employee` for `/br/.../team`, so the
  // capability alone must never keep them on `/` (role-route-matrix L1).
  if (pathname === "/" && !canAccess(claims.user_role, "owner")) {
    if (claims.user_role !== "self_service") {
      return redirectToDefaultLanding(request, response, claims);
    }
    const { data: canOpenHrHome, error: hrHomeError } = await supabase.rpc(
      "has_permission",
      {
        p_branch_id: null as unknown as number,
        p_key: PERMISSION_KEYS.HR_VIEW_EMPLOYEE,
      },
    );
    if (hrHomeError || canOpenHrHome !== true) {
      return redirectToDefaultLanding(request, response, claims);
    }
  } else if (isOwnerRoutePath(pathname) && claims.user_role !== "owner") {
    // Owner-plane routes default to owner-only. D076 operational roles may
    // access specific ModuleKeys (finance / inventory); D091 narrows Inventory.
    const ownerModuleKey: ModuleKey | null = resolveModuleFromPath(pathname);
    if (!ownerModuleKey || !canAccess(claims.user_role, ownerModuleKey)) {
      return redirectToDefaultLanding(request, response, claims);
    }
  }

  // Module ACL: each route resolves to a ModuleKey, and the user's role must
  // be in that module's allowedRoles. Owner routes that fail ACL
  // redirect to the role's default landing page; other routes redirect to
  // /access-denied.
  const moduleKey: ModuleKey | null = resolveModuleFromPath(pathname);
  if (moduleKey) {
    const homeHrBypass =
      pathname === "/" &&
      moduleKey === "owner" &&
      claims.user_role === "self_service" &&
      !canAccess(claims.user_role, "owner");
    if (!canAccess(claims.user_role, moduleKey) && !homeHrBypass) {
      if (isOwnerRoutePath(pathname)) {
        return redirectToDefaultLanding(request, response, claims);
      }

      return redirectToAccessDenied(
        request,
        response,
        "insufficient-permission",
      );
    }

    const pathMatch = pathname.match(/^\/br\/(\d+)(?:\/|$)/);
    if (pathMatch) {
      const routeBranchId = Number(pathMatch[1]);
      const allowCrossBranch = claims.user_role === "owner";

      if (!allowCrossBranch && claims.branch_id !== routeBranchId) {
        return redirectToAccessDenied(
          request,
          response,
          "branch-scope-mismatch",
        );
      }

      const isStationRoute =
        moduleKey === "pos" || moduleKey === "kds" || moduleKey === "pickup";
      const needsBranchSurface =
        isStationRoute || pathname.startsWith(`/br/${routeBranchId}/stock`);

      if (needsBranchSurface) {
        // Stations (POS/KDS/pickup) stay branch-kind "branch". Owner enters
        // any ACTIVE site's non-station surfaces; central roles are pinned to
        // their site kind; store roles stay on branch-kind sites.
        const requiredBranchKind = isStationRoute
          ? "branch"
          : requiredOperatorBranchKindForRole(claims.user_role);
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
        // POS/KDS branch surfaces. The exact pickup customer board path is public.
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
        // Owner is the business break-glass role for all Má Tư surfaces,
        // including POS/KDS/pickup.
        const networkGateEnabled =
          process.env.NODE_ENV === "production" &&
          claims.user_role !== "owner" &&
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
          const nowIso = new Date().toISOString();
          let allowed = false;

          // Per-branch emergency bypass (owner-activated TTL / Ca POS / Ngày).
          // Checked before trusted-IP deny — never use global POS_NETWORK_GATE
          // for a single-branch outage.
          const { data: bypassRow } = await supabase
            .from("branch_network_gate_bypasses")
            .select("id, bound_pos_session_id")
            .eq("branch_id", routeBranchId)
            .eq("tenant_id", claims.tenant_id)
            .is("revoked_at", null)
            .gt("expires_at", nowIso)
            .maybeSingle();

          if (bypassRow) {
            if (bypassRow.bound_pos_session_id == null) {
              allowed = true;
            } else {
              const { data: openSession } = await supabase
                .from("pos_sessions")
                .select("id")
                .eq("id", bypassRow.bound_pos_session_id)
                .eq("status", "open")
                .maybeSingle();
              allowed = openSession !== null;
            }
          }

          if (!allowed) {
            const clientIp = getClientIp(request.headers);
            const graceCutoff = new Date(
              Date.now() - 30 * 60_000,
            ).toISOString();
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
              allowed = trustRow !== null;
            }
          }

          if (!allowed) {
            return redirectToAccessDenied(
              request,
              response,
              "untrusted-network",
            );
          }
        }
      }
    }
  } else if (isOwnerRoutePath(pathname)) {
    // Owner route with no module mapping — redirect to default
    // landing to avoid serving management pages without ACL enforcement.
    return redirectToDefaultLanding(request, response, claims);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
