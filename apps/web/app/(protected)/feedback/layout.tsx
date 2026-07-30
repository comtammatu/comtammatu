import type { ReactNode } from "react";
import { canAccess } from "@comtammatu/shared/auth";
import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { AppPage } from "@/components/surface";
import { FeedbackSubNav } from "./_components/feedback-sub-nav";

export default async function FeedbackLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { claims } = await loadAuthState();
  if (!canAccess(claims.user_role, "feedback")) {
    redirect("/access-denied?reason=module");
  }

  return (
    <AppPage width="xwide">
      <FeedbackSubNav inboxHref="/feedback" qrHref="/feedback/qr" />
      {children}
    </AppPage>
  );
}
