import { Suspense } from "react";
import { loadAuthState } from "@/_lib/auth";
import { NotificationsClient } from "./notifications-client";
import { messages } from "@lib/messages";
import { AppPage, AppPageHeader } from "@/components/surface";

export const metadata = {
  title: "Thông báo — Cơm Tấm Má Tư",
};

export default async function NotificationsPage() {
  const { claims } = await loadAuthState();

  return (
    <AppPage width="narrow">
      <AppPageHeader
        title={messages.notifications.pageTitle}
        description={messages.notifications.pageDescription}
      />
      <Suspense>
        <NotificationsClient tenantId={claims.tenant_id} />
      </Suspense>
    </AppPage>
  );
}
