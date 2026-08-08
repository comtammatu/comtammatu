import { Suspense } from "react";
import { getSafeInternalReturnTo } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { NotificationsClient } from "./notifications-client";
import { AppPage } from "@/components/surface";

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
      <Suspense>
        <NotificationsClient
          tenantId={claims.tenant_id}
          branchId={claims.branch_id}
          backHref={backHref}
        />
      </Suspense>
    </AppPage>
  );
}
