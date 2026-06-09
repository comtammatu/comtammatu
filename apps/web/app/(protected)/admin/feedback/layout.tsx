import type { ReactNode } from "react";
import { loadAuthState } from "@/_lib/auth";
import { FeedbackNav } from "./feedback-nav";

interface FeedbackLayoutProps {
  children: ReactNode;
}

export default async function FeedbackLayout({
  children,
}: FeedbackLayoutProps) {
  const { claims } = await loadAuthState();
  const isOwner = claims.user_role === "owner";

  return (
    <div className="space-y-4">
      <FeedbackNav isOwner={isOwner} />
      {children}
    </div>
  );
}
