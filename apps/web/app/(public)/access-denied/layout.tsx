import type { ReactNode } from "react";

export default function AccessDeniedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh w-full items-center justify-center p-4"
    >
      {children}
    </main>
  );
}
