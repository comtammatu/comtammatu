import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@comtammatu/database/supabase/middleware";
import {
  extractClaims,
  canAccess,
  isPublicAppPath,
  resolvePostLoginRedirect,
  type BlockedStateReasonCode,
  resolveModuleFromPath,
} from "@comtammatu/shared/auth";
import type { ModuleKey } from "@comtammatu/shared/auth";

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

function redirectToBlockedDefault(
  request: NextRequest,
  sessionResponse: NextResponse,
  pathname: string,
  reason: BlockedStateReasonCode,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.searchParams.set("forbidden", "1");
  url.searchParams.set("reason", reason);
  return redirectWithCookies(url, sessionResponse);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths — skip auth
  if (isPublicAppPath(pathname)) {
    return NextResponse.next();
  }

  // Refresh session + get user
  const { user, response, supabase } = await updateSession(request);

  // Login page: special handling
  if (pathname === "/login") {
    if (!user) return response; // unauthenticated → show login
    // authenticated → redirect away from login to role's default
    const claims = extractClaims(user.app_metadata);
    if (claims) {
      const returnTo = request.nextUrl.searchParams.get("returnTo");
      const url = new URL(
        resolvePostLoginRedirect(claims, returnTo),
        request.nextUrl.origin,
      );
      return redirectWithCookies(url, response);
    }
    return response;
  }

  // Not authenticated → login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set(
      "returnTo",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return redirectWithCookies(url, response);
  }

  // Module ACL check
  const moduleKey: ModuleKey | null = resolveModuleFromPath(pathname);
  if (moduleKey) {
    const claims = extractClaims(user.app_metadata);
    if (!claims || !canAccess(claims.user_role, moduleKey)) {
      const fallbackClaims = claims ?? {
        tenant_id: 0,
        branch_id: null,
        area_id: null,
        user_role: "office" as const,
      };
      return redirectToBlockedDefault(
        request,
        response,
        resolvePostLoginRedirect(fallbackClaims, null),
        claims ? "insufficient-permission" : "missing-auth-context",
      );
    }

    // POS/KDS are not available on headquarters (office-only branch)
    if ((moduleKey === "pos" || moduleKey === "kds") && claims) {
      const pathMatch = pathname.match(/^\/br\/(\d+)\//);
      if (pathMatch) {
        const routeBranchId = Number(pathMatch[1]);
        const { data: hqRow } = await supabase
          .from("branches")
          .select("id")
          .eq("id", routeBranchId)
          .eq("tenant_id", claims.tenant_id)
          .eq("is_headquarters", true)
          .maybeSingle();
        if (hqRow) {
          return redirectToBlockedDefault(
            request,
            response,
            resolvePostLoginRedirect(claims, null),
            "headquarters-branch-restricted",
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
