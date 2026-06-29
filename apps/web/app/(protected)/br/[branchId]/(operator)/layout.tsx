import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Bell as IconBell, User as IconUser } from "lucide-react";
import { canAccess, ROLE_LABEL_VI } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage } from "@/components/surface";
import { BrandLogoBox, BrandMark } from "@/components/brand";
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

  const canUseEmployeePortal = canAccess(claims.user_role, "employee");
  const unreadResult = await getUnreadCount().catch(() => null);
  const unread = unreadResult?.success ? (unreadResult.data?.count ?? 0) : 0;

  return (
    <PwaRuntimeProvider>
      <div className="flex min-h-dvh w-full flex-col bg-muted/30">
        <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur print:hidden">
          <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-2 px-3 py-1.5 sm:gap-3 sm:py-2">
            <div className="flex min-w-0 items-center gap-2">
              <BrandLogoBox>
                <BrandMark decorative className="size-full" />
              </BrandLogoBox>
              <div className="min-w-0">
                <p className="font-heading truncate text-sm font-semibold sm:text-base">
                  {context.branch.name}
                </p>
                <p className="hidden truncate text-xs text-muted-foreground sm:block">
                  {ROLE_LABEL_VI[claims.user_role]}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="outline" className="hidden sm:inline-flex">
                {ROLE_LABEL_VI[claims.user_role]}
              </Badge>
              <Button
                asChild
                variant="outline"
                size="touch"
                aria-label={messages.employee.header.notificationsAria}
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
              {canUseEmployeePortal ? (
                <Button
                  asChild
                  variant="outline"
                  size="touch"
                  aria-label={messages.employee.header.profileAria}
                  className="min-w-12 px-0"
                >
                  <Link href="/employee/profile">
                    <IconUser data-icon="inline-start" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </header>
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
        />
      </div>
    </PwaRuntimeProvider>
  );
}
