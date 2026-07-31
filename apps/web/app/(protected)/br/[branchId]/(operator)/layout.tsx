import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Bell as IconBell,
  Ellipsis as IconEllipsis,
  House as IconHouse,
  LayoutDashboard as IconLayoutDashboard,
  User as IconUser,
} from "lucide-react";
import {
  canAccess,
  MODULE_ACL,
  ROLE_LABEL_VI,
  canSubscribeBranchOpsTopic,
  type BranchKind,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { AppPage } from "@/components/surface";
import { AppHeader } from "@/components/app-header";
import { NotificationCountBadge } from "@/components/notification-count-badge";
import { PwaRuntimeProvider } from "@/components/pwa-runtime";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { messages } from "@lib/messages";
import { getUnreadCount } from "@/(protected)/notifications/actions";
import { parseOperatorBranchId } from "../_lib/parse-branch-id";
import { BranchOpsRefresh } from "./branch-ops-refresh";
import { OperatorBottomNav } from "./operator-bottom-nav";
import { OperatorPwaToolbar } from "./operator-pwa-toolbar";
import { ThemeMenuItem } from "@/components/theme-toggle";

export function generateMetadata(): Metadata {
  return {
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Cổng Má Tư",
    },
  };
}

export default async function OperatorLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const unreadPromise = getUnreadCount().catch(() => null);
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  const canUseShiftTab =
    claims.user_role !== "owner" &&
    (canAccess(claims.user_role, "branch_home") ||
      canAccess(claims.user_role, "employee_checkout_approvals"));
  const canManageBranch =
    canAccess(claims.user_role, "branch_dashboard") ||
    canAccess(claims.user_role, "branch_settings") ||
    canAccess(claims.user_role, "branch_pos_sessions");
  const canOpenOwnerHome = claims.user_role === "owner";
  const usesHeaderOverflow = canOpenOwnerHome || canManageBranch;
  const unreadResult = await unreadPromise;
  const unread = unreadResult?.success ? (unreadResult.data?.count ?? 0) : 0;
  const notificationsHref = `/notifications?returnTo=${encodeURIComponent(`/br/${context.branchId}`)}`;
  const compactBranchName = context.branch.name.replace(/^Chi nhánh\s+/, "");
  const notificationsAria =
    unread > 0
      ? `${messages.operator.header.notificationsAria}, ${unread} chưa đọc`
      : messages.operator.header.notificationsAria;

  return (
    <PwaRuntimeProvider>
      {canSubscribeBranchOpsTopic(claims, context.branchId) ? (
        <BranchOpsRefresh
          branchId={context.branchId}
          disabledPathPrefixes={[`/br/${context.branchId}/shift/leave-approvals`]}
        />
      ) : null}
      <div className="chrome-safe-pt flex h-dvh w-full flex-col overflow-hidden touch-manipulation bg-muted/30">
        <AppHeader
          title={
            <>
              <span className="sm:hidden">{compactBranchName}</span>
              <span className="hidden sm:inline">{context.branch.name}</span>
            </>
          }
          subtitle={ROLE_LABEL_VI[claims.user_role]}
          subtitleHiddenOnMobile
          homeHref={`/br/${context.branchId}`}
          homeAriaLabel={APP_COPY_VI.branchHome}
          showThemeToggle={!usesHeaderOverflow}
          wide
          actions={
            <>
              {usesHeaderOverflow ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-touch"
                        aria-label={messages.operator.header.moreActionsAria}
                      >
                        <IconEllipsis />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end">
                    {canOpenOwnerHome ? (
                      <DropdownMenuItem
                        className="min-h-12 text-sm"
                        render={<Link href={MODULE_ACL.owner.path} />}
                      >
                        <IconHouse data-icon="inline-start" />
                        {APP_COPY_VI.ownerTitle}
                      </DropdownMenuItem>
                    ) : null}
                    {canManageBranch ? (
                      <DropdownMenuItem
                        className="min-h-12 text-sm"
                        render={
                          <Link href={`/br/${context.branchId}/dashboard`} />
                        }
                      >
                        <IconLayoutDashboard data-icon="inline-start" />
                        {APP_COPY_VI.branchCommand}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <ThemeMenuItem className="min-h-12 text-sm" />
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              <Button
                variant="outline"
                size="icon-touch"
                aria-label={messages.operator.nav.profileShort}
                render={<Link href={`/br/${context.branchId}/profile`} />}
              >
                <IconUser />
              </Button>
              <Button
                variant="outline"
                size="icon-touch"
                aria-label={notificationsAria}
                className="relative"
                render={<Link href={notificationsHref} />}
              >
                <IconBell />
                <NotificationCountBadge count={unread} />
              </Button>
            </>
          }
        />
        <OperatorPwaToolbar />
        <div
          id="main-content"
          tabIndex={-1}
          role="main"
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
        >
          <AppPage
            density="compact"
            className="flex min-h-0 flex-1 flex-col"
            contentClassName="min-h-0 flex-1 max-w-lg md:max-w-2xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-screen-2xl"
          >
            {children}
          </AppPage>
        </div>
        <OperatorBottomNav
          branchId={context.branchId}
          showEmployeeLinks={canUseShiftTab}
          showBranchManagement={canManageBranch}
          branchKind={context.branch.branch_kind as BranchKind}
        />
      </div>
    </PwaRuntimeProvider>
  );
}
