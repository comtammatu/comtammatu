import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Bell as IconBell,
  Building2 as IconBuilding2,
  User as IconUser,
} from "lucide-react";
import {
  canAccess,
  MODULE_ACL,
  ROLE_LABEL_VI,
  type BranchKind,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI, getSiteKindLabelVi } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ branchId: string }>;
}): Promise<Metadata> {
  const { branchId } = await params;
  return {
    manifest: `/br/${branchId}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Má Tư Hub",
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

  const canUseEmployeePortal =
    canAccess(claims.user_role, "employee") ||
    canAccess(claims.user_role, "employee_checkout_approvals");
  const canManageBranch =
    canAccess(claims.user_role, "branch_dashboard") ||
    canAccess(claims.user_role, "branch_settings") ||
    canAccess(claims.user_role, "branch_pos_sessions");
  const canUseBranchPicker = canAccess(claims.user_role, "branch_picker");
  const unreadResult = await getUnreadCount().catch(() => null);
  const unread = unreadResult?.success ? (unreadResult.data?.count ?? 0) : 0;
  const notificationsHref = `/notifications?returnTo=${encodeURIComponent(`/br/${context.branchId}`)}`;
  const branchKind = context.branch.branch_kind as BranchKind;
  const hubLabel = getSiteKindLabelVi(branchKind);

  return (
    <PwaRuntimeProvider>
      <BranchOpsRefresh branchId={context.branchId} />
      <div className="flex h-dvh w-full flex-col overflow-hidden touch-manipulation bg-muted/30">
        <AppHeader
          title={context.branch.name}
          subtitle={`Hub ${hubLabel} · ${ROLE_LABEL_VI[claims.user_role]}`}
          homeHref={`/br/${context.branchId}`}
          homeAriaLabel={APP_COPY_VI.operatorHome}
          actions={
            <>
              {canUseBranchPicker ? (
                <Button
                  asChild
                  variant="outline"
                  size="touch"
                  aria-label={MODULE_ACL.branch_picker.label}
                  title={MODULE_ACL.branch_picker.label}
                >
                  <Link href={MODULE_ACL.branch_picker.path}>
                    <IconBuilding2 data-icon="inline-start" />
                    <span>{MODULE_ACL.branch_picker.label}</span>
                  </Link>
                </Button>
              ) : null}
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
                  <NotificationCountBadge count={unread} />
                </Link>
              </Button>
            </>
          }
        />
        <OperatorPwaToolbar />
        <div
          id="main-content"
          role="main"
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
        >
          <AppPage
            density="compact"
            contentClassName="max-w-lg md:max-w-3xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-screen-2xl"
          >
            {children}
          </AppPage>
        </div>
        <OperatorBottomNav
          branchId={context.branchId}
          showEmployeeLinks={canUseEmployeePortal}
          showBranchManagement={canManageBranch}
          branchKind={branchKind}
        />
      </div>
    </PwaRuntimeProvider>
  );
}
