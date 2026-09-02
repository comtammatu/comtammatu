import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PwaRuntimeProvider } from "@/components/pwa-runtime";
import { MePwaToolbar } from "./me-pwa-toolbar";

export const metadata: Metadata = {
  manifest: "/me/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Trang cá nhân",
  },
};

export default function SelfServiceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <PwaRuntimeProvider>
      <MePwaToolbar />
      {children}
    </PwaRuntimeProvider>
  );
}
