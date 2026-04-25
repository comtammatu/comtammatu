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

  // Refresh session + get user
  const { user, response, supabase } = await updateSession(request);

  // Login page: special handling.
  if (pathname === "/login" || pathname === "/beta/login") {
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

    // Branch-scoped routes (POS/KDS + branch_settings) enforce URL branchId
    // matches the user's assigned branch_id. Admin-level roles
    // (owner/super_manager/area_manager) may traverse any branch's settings.
    // POS/KDS also require the branch be operational (not warehouse/central_kitchen).
    if (
      moduleKey === "pos" ||
      moduleKey === "kds" ||
      moduleKey === "branch_settings"
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
          moduleKey === "branch_settings" &&
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
