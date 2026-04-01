import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@comtammatu/database/supabase/middleware";
import { extractClaims, canAccess, isAdminRole } from "@comtammatu/shared/auth";
import type { ModuleKey } from "@comtammatu/shared/auth";

const PUBLIC_PATHS = ["/login", "/api/health", "/api/webhooks"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

/** Map pathname to ModuleKey for ACL check */
function resolveModule(pathname: string): ModuleKey | null {
  if (pathname.startsWith("/admin/dashboard")) return "dashboard";
  if (pathname.startsWith("/admin/menu")) return "menu";
  if (pathname.startsWith("/admin/inventory")) return "inventory";
  if (pathname.startsWith("/admin/orders")) return "orders";
  if (pathname.startsWith("/admin/hr")) return "hr";
  if (pathname.startsWith("/admin/crm")) return "crm";
  if (pathname.startsWith("/admin/finance")) return "finance";
  if (pathname.startsWith("/admin/reports")) return "reports";
  if (pathname.startsWith("/admin/settings")) return "settings";
  if (pathname.match(/^\/br\/\d+\/pos/)) return "pos";
  if (pathname.match(/^\/br\/\d+\/kds/)) return "kds";
  if (pathname.startsWith("/employee")) return "employee";
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths — skip auth
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Refresh session + get user
  const { user, response } = await updateSession(request);

  // Not authenticated → login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Already on login page + authenticated → redirect to dashboard
  if (pathname === "/login") {
    const claims = extractClaims(user.app_metadata);
    if (claims) {
      const url = request.nextUrl.clone();
      url.pathname = isAdminRole(claims.user_role)
        ? "/admin/dashboard"
        : "/employee";
      return NextResponse.redirect(url);
    }
  }

  // Module ACL check
  const moduleKey = resolveModule(pathname);
  if (moduleKey) {
    const claims = extractClaims(user.app_metadata);
    if (!claims || !canAccess(claims.user_role, moduleKey)) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/dashboard";
      url.searchParams.set("forbidden", "1");
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
