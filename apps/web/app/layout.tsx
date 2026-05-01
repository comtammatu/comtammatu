import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { JetBrains_Mono } from "next/font/google";
import { ConfirmDialogProvider } from "@comtammatu/ui/components/confirm-dialog";
import { ThemeProvider } from "@comtammatu/ui/components/theme-provider";
import { TooltipProvider } from "@comtammatu/ui/components/tooltip";
import { BoneyardRegistry } from "./_components/boneyard-registry";
import { NotificationBellFloating } from "./_components/notification-bell-floating";
import { ResponsiveToaster } from "./_components/responsive-toaster";
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
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
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
  viewportFit: "cover",
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
          <ResponsiveToaster />
          <ConfirmDialogProvider />
        </ThemeProvider>
      </body>
    </html>
  );
}
