import type { ReactNode } from "react";

export default function PublicFeedbackLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="bg-muted min-h-screen">
      <div className="mx-auto max-w-md px-4 py-8">{children}</div>
    </div>
  );
}
