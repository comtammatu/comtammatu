import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@comtammatu/database/supabase/middleware";
import {
  buildAccessDeniedPath,
  canAccess,
  extractClaimsFromAccessToken,
  isAdminRoutePath,
  isBetaPath,
  isPublicAppPath,
  PERMISSION_KEYS,
  resolveModuleFromPath,
  resolvePostLoginRedirect,
  stripBetaPrefix,
  type AuthSurface,
  type BlockedStateReasonCode,
  type JwtClaims,
  type ModuleKey,
} from "@comtammatu/shared/auth";
import { getClientIp } from "@lib/network/client-ip";

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

  // Refresh session + get user
  const { user, response, supabase } = await updateSession(request);

  // Login page: special handling.
  if (pathname === "/login" || pathname === "/beta/login") {
    if (request.method !== "GET" || request.headers.has("next-action")) {
      return response;
    }

    if (!user) return response; // unauthenticated → show login
    // Authenticated → bounce to role's post-login destination.
    const {
      data: { session: loginSession },
    } = await supabase.auth.getSession();
    const claims = extractClaimsFromAccessToken(loginSession?.access_token);
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
  if (!user) {
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
  // Claims are decoded from the JWT access_token, NOT from `user.app_metadata`.
  // Supabase-js reads `user.app_metadata` from the `auth.users` row, which does
  // not include hook-injected claims like `user_role` or `position`.
  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();
  const claims = extractClaimsFromAccessToken(authSession?.access_token);
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
      if (isAdminRoutePath(pathname)) {
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
      moduleKey === "branch_settings" ||
      moduleKey === "branch_menu_limits"
    ) {
      const routePath = surface === "beta" ? stripBetaPrefix(pathname) : pathname;
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

        if (moduleKey === "pos" || moduleKey === "kds") {
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
          // print-agent (registered via /api/branch-presence) may load POS/KDS.
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
            process.env.NODE_ENV === "production"
            && process.env.POS_NETWORK_GATE !== "off";
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
