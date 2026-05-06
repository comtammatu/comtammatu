import type { ReactNode } from "react";
import Link from "next/link";
import { loadAuthState } from "@/_lib/auth";

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
      <nav className="flex gap-1 border-b pb-0" aria-label="Feedback navigation">
        <Link
          href="/admin/feedback"
          className="px-4 py-2 text-sm font-medium hover:text-foreground data-[active]:border-b-2 data-[active]:border-primary data-[active]:text-primary"
        >
          Inbox
        </Link>
        <Link
          href="/admin/feedback/qr"
          className="px-4 py-2 text-sm font-medium hover:text-foreground"
        >
          QR codes
        </Link>
        {isOwner ? (
          <Link
            href="/admin/feedback/settings"
            className="px-4 py-2 text-sm font-medium hover:text-foreground"
          >
            Cài đặt
          </Link>
        ) : null}
      </nav>
      {children}
    </div>
  );
}
