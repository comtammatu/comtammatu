import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { JetBrains_Mono } from "next/font/google";
import { ConfirmDialogProvider } from "@comtammatu/ui/components/confirm-dialog";
import { Toaster } from "@comtammatu/ui/components/sonner";
import { ThemeProvider } from "@comtammatu/ui/components/theme-provider";
import { TooltipProvider } from "@comtammatu/ui/components/tooltip";
import { BoneyardRegistry } from "./_components/boneyard-registry";
import { NotificationBellFloating } from "./_components/notification-bell-floating";
import "@comtammatu/ui/globals.css";
import { cn } from "@/lib/utils";

const fontMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cơm Tấm Má Tư",
  description: "Hệ thống điều hành nhà hàng Cơm Tấm Má Tư",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CTMT",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#171717" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="vi"
      className={cn(fontMono.variable, "font-mono")}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-mono text-foreground antialiased">
        <a
          href="#main-content"
          className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Bỏ qua điều hướng
        </a>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <BoneyardRegistry />
          <TooltipProvider>{children}</TooltipProvider>
          <NotificationBellFloating />
          <Toaster richColors position="top-right" />
          <ConfirmDialogProvider />
        </ThemeProvider>
      </body>
    </html>
  );
}
