import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSafeInternalReturnTo } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import { NotificationsClient } from "./notifications-client";
import { messages } from "@lib/messages";
import { AppPage, AppPageHeader } from "@/components/surface";

export const metadata = {
  title: "Thông báo — Cơm Tấm Má Tư",
};

type NotificationsPageProps = {
  searchParams?: Promise<{
    returnTo?: string | string[];
  }>;
};

export default async function NotificationsPage({
  searchParams,
}: NotificationsPageProps) {
  const paramsPromise: Promise<{ returnTo?: string | string[] }> =
    searchParams ?? Promise.resolve({});
  const [{ claims }, params] = await Promise.all([
    loadAuthState(),
    paramsPromise,
  ]);
  const rawReturnTo = Array.isArray(params.returnTo)
    ? params.returnTo[0]
    : params.returnTo;
  const backHref =
    getSafeInternalReturnTo(rawReturnTo) ??
    (typeof claims.branch_id === "number" ? `/br/${claims.branch_id}` : null);

  return (
    <AppPage width="narrow">
      <AppPageHeader
        title={messages.notifications.pageTitle}
        description={messages.notifications.pageDescription}
        actions={
          backHref ? (
            <Button
              variant="outline"
              size="touch"
              render={<Link href={backHref} />}
            >
              <ArrowLeft data-icon="inline-start" />
              {messages.notifications.back}
            </Button>
          ) : undefined
        }
      />
      <Suspense>
        <NotificationsClient
          tenantId={claims.tenant_id}
          branchId={claims.branch_id}
        />
      </Suspense>
    </AppPage>
  );
}
