import Link from "next/link";
import { Bell as IconBell, User as IconUser } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { BrandMark } from "@/components/brand";
import { getUnreadCount } from "@/_actions/notifications";
import { getEmployeeContext } from "../_lib/employee-context";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { EmployeeDesktopNav } from "./bottom-nav";

export async function MobileHeader() {
  const { claims } = await loadAuthState();
  const ctx = await getEmployeeContext();
  const copy = messages.employee.header;
  const positionCode = claims.position ?? claims.position_code ?? null;
  const [unreadResult, positionResult] = await Promise.all([
    getUnreadCount().catch(() => null),
    positionCode
      ? ctx?.supabase
          .from("positions")
          .select("label_vi")
          .eq("tenant_id", claims.tenant_id)
          .eq("code", positionCode)
          .maybeSingle() ?? Promise.resolve({ data: null })
      : Promise.resolve({ data: null }),
  ]);
  const unread = unreadResult?.success ? (unreadResult.data?.count ?? 0) : 0;

  const positionLabel =
    positionResult.data?.label_vi ?? positionCode ?? claims.user_role;
  const branchName = ctx?.branchName ?? null;

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur print:hidden">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-3 py-2.5 lg:max-w-5xl">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background p-1">
            <BrandMark decorative className="size-full" />
          </span>
          <div className="min-w-0">
            <p className="font-heading truncate text-base font-semibold">
              {copy.title}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {branchName ?? copy.noBranch}
            </p>
          </div>
        </div>
        <EmployeeDesktopNav />
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className="hidden sm:inline-flex lg:hidden">
            {positionLabel}
          </Badge>
          <Button
            asChild
            variant="outline"
            size="icon-sm"
            aria-label="Thông báo"
            className="relative"
          >
            <Link href="/notifications">
              <IconBell className="size-4" />
              {unread > 0 ? (
                <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-2xs font-semibold text-destructive-foreground">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="icon-sm"
            aria-label={copy.profileAria}
          >
            <Link href="/employee/profile">
              <IconUser className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
