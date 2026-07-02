import Link from "next/link";
import { Bell as IconBell, User as IconUser } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { AppHeader } from "@/components/app-header";
import { getUnreadCount } from "@/(protected)/notifications/actions";
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
      ? (ctx?.supabase
          .from("positions")
          .select("label_vi")
          .eq("tenant_id", claims.tenant_id)
          .eq("code", positionCode)
          .maybeSingle() ?? Promise.resolve({ data: null }))
      : Promise.resolve({ data: null }),
  ]);
  const unread = unreadResult?.success ? (unreadResult.data?.count ?? 0) : 0;

  const positionLabel =
    positionResult.data?.label_vi ?? positionCode ?? claims.user_role;
  const branchName = ctx?.branchName ?? null;
  const headerTitle = branchName ?? copy.title;
  const headerSubtitle = branchName ? positionLabel : copy.noBranch;

  return (
    <AppHeader
      title={headerTitle}
      subtitle={headerSubtitle}
      subtitleHiddenOnMobile
      wide
      nav={<EmployeeDesktopNav />}
      actions={
        <>
          <Badge variant="outline" className="hidden sm:inline-flex lg:hidden">
            {positionLabel}
          </Badge>
          <Button
            asChild
            variant="outline"
            size="touch"
            aria-label={copy.notificationsAria}
            className="relative min-w-12 px-0"
          >
            <Link href="/notifications">
              <IconBell data-icon="inline-start" />
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
            size="touch"
            aria-label={copy.profileAria}
            className="min-w-12 px-0"
          >
            <Link href="/employee/profile">
              <IconUser data-icon="inline-start" />
            </Link>
          </Button>
        </>
      }
    />
  );
}
