import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@comtammatu/database/supabase/middleware";
import {
  buildAccessDeniedPath,
  canAccess,
  extractClaims,
  isBetaPath,
  isPublicAppPath,
  resolveModuleFromPath,
  resolvePostLoginRedirect,
  stripBetaPrefix,
  type AuthSurface,
  type BlockedStateReasonCode,
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
    const claims = extractClaims(user.app_metadata);
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

  // Authenticated — verify claims + module ACL. Any failure below routes to
  // `/access-denied` (authenticated but blocked) rather than bouncing through
  // login. Proxy is the single gate: layouts and pages downstream MUST NOT
  // re-check these invariants.
  const claims = extractClaims(user.app_metadata);
  if (!claims) {
    return redirectToAccessDenied(
      request,
      response,
      "missing-auth-context",
    );
  }

  const moduleKey: ModuleKey | null = resolveModuleFromPath(pathname);
  if (moduleKey) {
    if (!canAccess(claims.user_role, moduleKey)) {
      return redirectToAccessDenied(
        request,
        response,
        "insufficient-permission",
      );
    }

    // POS/KDS are branch-scoped. Enforce two rules in proxy so layouts stay dumb:
    //   1. URL branchId must match the user's assigned branch_id.
    //   2. Branch must be operational (not warehouse / central_kitchen).
    if (moduleKey === "pos" || moduleKey === "kds") {
      const routePath = surface === "beta" ? stripBetaPrefix(pathname) : pathname;
      const pathMatch = routePath.match(/^\/br\/(\d+)\//);
      if (pathMatch) {
        const routeBranchId = Number(pathMatch[1]);

        if (claims.branch_id === null || claims.branch_id !== routeBranchId) {
          return redirectToAccessDenied(
            request,
            response,
            "branch-scope-mismatch",
          );
        }

        const { data: branchRow } = await supabase
          .from("branches")
          .select("id, branch_kind")
          .eq("id", routeBranchId)
          .eq("tenant_id", claims.tenant_id)
          .maybeSingle();
        const kind = branchRow?.branch_kind;
        if (
          branchRow &&
          (kind === "warehouse" || kind === "central_kitchen")
        ) {
          return redirectToAccessDenied(
            request,
            response,
            "warehouse-branch-restricted",
          );
        }
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
