import Link from "next/link";
import { Settings as IconSettings, User as IconUser } from "lucide-react";
import { canAccess, ROLE_LABEL_VI } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { getEmployeeContext } from "../_lib/employee-context";
import { loadAuthState } from "@/_lib/auth";
import { EmployeeDesktopNav } from "./bottom-nav";

export async function MobileHeader() {
  const { claims } = await loadAuthState();
  const ctx = await getEmployeeContext();

  const roleLabel = ROLE_LABEL_VI[claims.user_role] ?? claims.user_role;
  const branchName = ctx?.branchName ?? null;
  const settingsHref = canAccess(claims.user_role, "settings")
    ? "/admin/settings"
    : null;

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-3 py-3 sm:px-4 lg:px-6">
        <div className="min-w-0">
          <p className="text-base font-semibold">Cổng nhân viên</p>
          <p className="truncate text-xs text-muted-foreground">
            {branchName ?? "Chưa gắn chi nhánh"}
          </p>
        </div>
        <div className="hidden min-w-0 flex-1 justify-center lg:flex">
          <EmployeeDesktopNav />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline" size="icon-sm" aria-label="Cá nhân">
            <Link href="/employee/profile">
              <IconUser className="size-4" />
            </Link>
          </Button>
          {settingsHref ? (
            <Button
              asChild
              variant="outline"
              size="icon-sm"
              aria-label="Cài đặt"
            >
              <Link href={settingsHref}>
                <IconSettings className="size-4" />
              </Link>
            </Button>
          ) : null}
          <Badge variant="outline" className="hidden sm:inline-flex">
            {roleLabel}
          </Badge>
          <Badge
            variant={branchName ? "success" : "warning"}
            className="hidden sm:inline-flex"
          >
            {branchName ? "Chi nhánh" : "Thiếu chi nhánh"}
          </Badge>
        </div>
      </div>
    </header>
  );
}
