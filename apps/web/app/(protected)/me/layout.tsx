import type { ReactNode } from "react";
import { PwaRuntimeProvider } from "@/components/pwa-runtime";

export default function SelfServiceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <PwaRuntimeProvider>{children}</PwaRuntimeProvider>;
}
