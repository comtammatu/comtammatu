import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@comtammatu/database/supabase/middleware";
import {
  extractClaims,
  canAccess,
  getDefaultRedirect,
} from "@comtammatu/shared/auth";
import type { ModuleKey } from "@comtammatu/shared/auth";

const PUBLIC_PATHS = ["/api/health", "/api/webhooks"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

/** Sub-routes under /admin/inventory restricted to owner + super_manager */
const INVENTORY_PROCUREMENT_PREFIXES = [
  "/admin/inventory/suppliers",
  "/admin/inventory/purchase-orders",
  "/admin/inventory/grn",
  "/admin/inventory/supplier-invoices",
  "/admin/inventory/recipes",
] as const;

/** Map pathname to ModuleKey for ACL check */
function resolveModule(pathname: string): ModuleKey | null {
  if (pathname.startsWith("/admin/dashboard")) return "dashboard";
  if (pathname.startsWith("/admin/menu")) return "menu";
  for (const prefix of INVENTORY_PROCUREMENT_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return "inventory_procurement";
    }
  }
  if (pathname.startsWith("/admin/inventory")) return "inventory";
  if (pathname.startsWith("/admin/orders")) return "orders";
  if (pathname.startsWith("/admin/staff")) return "staff";
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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths — skip auth
  if (isPublic(pathname)) {
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
      const url = request.nextUrl.clone();
      url.pathname = getDefaultRedirect(claims);
      return redirectWithCookies(url, response);
    }
    return response;
  }

  // Not authenticated → login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectWithCookies(url, response);
  }

  // Module ACL check
  const moduleKey = resolveModule(pathname);
  if (moduleKey) {
    const claims = extractClaims(user.app_metadata);
    if (!claims || !canAccess(claims.user_role, moduleKey)) {
      const url = request.nextUrl.clone();
      const fallbackClaims = claims ?? {
        tenant_id: 0,
        branch_id: null,
        area_id: null,
        user_role: "office" as const,
      };
      url.pathname = getDefaultRedirect(fallbackClaims);
      url.searchParams.set("forbidden", "1");
      return redirectWithCookies(url, response);
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
          const url = request.nextUrl.clone();
          url.pathname = getDefaultRedirect(claims);
          url.searchParams.set("forbidden", "1");
          return redirectWithCookies(url, response);
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
