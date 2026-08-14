import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CalendarCheck as IconCalendarCheck,
  Ellipsis as IconEllipsis,
  House as IconHouse,
  MessageSquareHeart as IconMessageSquareHeart,
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
import { PwaRuntimeProvider } from "@/components/pwa-runtime";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../_lib/parse-branch-id";
import { branchNavBadgeCounts } from "./_lib/branch-nav-badges";
import { BranchOpsRefresh } from "./branch-ops-refresh";
import { fetchBranchQueueCounts } from "./dashboard/data";
import { OperatorBottomNav } from "./operator-bottom-nav";
import { OperatorNotificationBell } from "./operator-notification-bell";
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
  const canCloseDay = canAccess(claims.user_role, "branch_close_day");
  const canOpenFeedback = canAccess(claims.user_role, "branch_feedback");
  const canOpenOwnerHome = claims.user_role === "owner";
  const usesHeaderOverflow =
    canOpenOwnerHome || canCloseDay || canOpenFeedback;
  const compactBranchName = context.branch.name.replace(/^Chi nhánh\s+/, "");
  const notificationsReturnTo = `/br/${context.branchId}`;
  const branchKind = context.branch.branch_kind as BranchKind;
  const navBadges =
    branchKind === "branch" && canManageBranch
      ? branchNavBadgeCounts(
          await fetchBranchQueueCounts(
            supabase,
            claims,
            context.branchId,
            branchKind,
          ).catch((error: unknown) => {
            console.error("operator.layout.queue_badges_failed", error);
            return {
              pendingCheckouts: null,
              pendingLeaveRequests: null,
              pendingCountSlips: null,
              pendingWaste: null,
              inboundTransfers: null,
              openStockRequests: null,
            };
          }),
        )
      : undefined;

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
          homeHref={
            branchKind === "branch"
              ? `/br/${context.branchId}`
              : "/"
          }
          homeAriaLabel={
            branchKind === "branch"
              ? APP_COPY_VI.branchHome
              : APP_COPY_VI.ownerTitle
          }
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
                    {canCloseDay ? (
                      <DropdownMenuItem
                        className="min-h-12 text-sm"
                        render={
                          <Link href={`/br/${context.branchId}/close-day`} />
                        }
                      >
                        <IconCalendarCheck data-icon="inline-start" />
                        {messages.settings.branch.closeDayTitle}
                      </DropdownMenuItem>
                    ) : null}
                    {canOpenFeedback ? (
                      <DropdownMenuItem
                        className="min-h-12 text-sm"
                        render={
                          <Link href={`/br/${context.branchId}/feedback`} />
                        }
                      >
                        <IconMessageSquareHeart data-icon="inline-start" />
                        {MODULE_ACL.branch_feedback.label}
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
              <OperatorNotificationBell returnTo={notificationsReturnTo} />
            </>
          }
        />
        <OperatorPwaToolbar />
        <div
          id="main-content"
          tabIndex={-1}
          role="main"
          className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain"
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
          branchKind={branchKind}
          badges={navBadges}
        />
      </div>
    </PwaRuntimeProvider>
  );
}
