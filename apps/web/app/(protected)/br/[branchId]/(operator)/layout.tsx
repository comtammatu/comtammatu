import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Bell as IconBell, User as IconUser } from "lucide-react";
import { canAccess, ROLE_LABEL_VI } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage } from "@/components/surface";
import { AppHeader } from "@/components/app-header";
import { PwaRuntimeProvider } from "@/components/pwa-runtime";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { messages } from "@lib/messages";
import { getUnreadCount } from "@/(protected)/notifications/actions";
import { OperatorBottomNav } from "./operator-bottom-nav";

function parseBranchId(raw: string): number | null {
  const branchId = Number(raw);
  return Number.isInteger(branchId) && branchId > 0 ? branchId : null;
}

export default async function OperatorLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  const canUseEmployeePortal =
    canAccess(claims.user_role, "employee") ||
    canAccess(claims.user_role, "employee_checkout_approvals");
  const canManageBranch =
    canAccess(claims.user_role, "branch_dashboard") ||
    canAccess(claims.user_role, "branch_settings");
  const unreadResult = await getUnreadCount().catch(() => null);
  const unread = unreadResult?.success ? (unreadResult.data?.count ?? 0) : 0;
  const notificationsHref = `/notifications?returnTo=${encodeURIComponent(`/br/${context.branchId}`)}`;

  return (
    <PwaRuntimeProvider>
      <div className="flex min-h-dvh w-full flex-col bg-muted/30">
        <AppHeader
          title={context.branch.name}
          subtitle={ROLE_LABEL_VI[claims.user_role]}
          actions={
            <>
              <Button
                asChild
                variant="outline"
                size="icon-touch"
                aria-label={messages.employee.nav.profileShort}
              >
                <Link href={`/br/${context.branchId}/profile`}>
                  <IconUser />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="icon-touch"
                aria-label={messages.employee.header.notificationsAria}
                className="relative"
              >
                <Link href={notificationsHref}>
                  <IconBell />
                  {unread > 0 ? (
                    <span className="absolute right-1 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-2xs font-semibold leading-none text-destructive-foreground">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  ) : null}
                </Link>
              </Button>
            </>
          }
        />
        <div
          id="main-content"
          role="main"
          className="flex min-h-0 flex-1 flex-col"
        >
          <AppPage
            density="compact"
            mobile
            contentClassName="max-w-lg lg:max-w-3xl"
          >
            {children}
          </AppPage>
        </div>
        <OperatorBottomNav
          branchId={context.branchId}
          showEmployeeLinks={canUseEmployeePortal}
          showBranchManagement={canManageBranch}
        />
      </div>
    </PwaRuntimeProvider>
  );
}
