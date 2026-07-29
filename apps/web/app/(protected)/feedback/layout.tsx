import type { ReactNode } from "react";
import { canAccess } from "@comtammatu/shared/auth";
import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { ControlSurfaceShell } from "@/components/control-surface-shell";
import { AppPage } from "@/components/surface";
import { FeedbackSubNav } from "./_components/feedback-sub-nav";

export default async function FeedbackLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { session, claims } = await loadAuthState();
  if (!canAccess(claims.user_role, "feedback")) {
    redirect("/access-denied?reason=module");
  }

  return (
    <ControlSurfaceShell
      module="feedback"
      user={{
        name:
          session.user.user_metadata?.["display_name"] ??
          session.user.email ??
          "",
      }}
      role={claims.user_role}
      homeBranchId={claims.branch_id}
    >
      <AppPage width="xwide">
        <FeedbackSubNav inboxHref="/feedback" qrHref="/feedback/qr" />
        {children}
      </AppPage>
    </ControlSurfaceShell>
  );
}
