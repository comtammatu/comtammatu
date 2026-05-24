import type { ReactNode } from "react";

export default function AccessDeniedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main
      id="main-content"
      className="flex min-h-dvh w-full items-center justify-center p-4 sm:p-6"
    >
      {children}
    </main>
  );
}
