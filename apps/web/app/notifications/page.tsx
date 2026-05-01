import { Suspense } from "react";
import { loadAuthState } from "@/_lib/auth";
import { NotificationsClient } from "./notifications-client";
import { messages } from "@lib/messages";

export const metadata = {
  title: "Thông báo — Cơm Tấm Má Tư",
};

export default async function NotificationsPage() {
  const { claims } = await loadAuthState();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {messages.notifications.pageTitle}
        </h1>
        <p className="text-sm text-muted-foreground">
          {messages.notifications.pageDescription}
        </p>
      </header>
      <Suspense>
        <NotificationsClient tenantId={claims.tenant_id} />
      </Suspense>
    </div>
  );
}
