import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Be_Vietnam_Pro, JetBrains_Mono } from "next/font/google";
import { ConfirmDialogProvider } from "@comtammatu/ui/components/confirm-dialog";
import { ThemeProvider } from "@comtammatu/ui/components/theme-provider";
import { ThemeScript } from "@comtammatu/ui/components/theme-script";
import { TooltipProvider } from "@comtammatu/ui/components/tooltip";
import { BoneyardRegistry } from "./_components/boneyard-registry";
import { NotificationBellFloating } from "./_components/notification-bell-floating";
import { ResponsiveToaster } from "./_components/responsive-toaster";
import { SerwistProvider } from "./serwist-provider";
import "@comtammatu/ui/globals.css";
import { cn } from "@/lib/utils";
import { messages } from "@lib/messages";

const fontMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-mono",
  display: "swap",
});

// matu-superapp baseline, promoted app-wide 2026-05-09: Be Vietnam Pro is
// the shared operational UI face for body text and headings.
const fontMatuBody = Be_Vietnam_Pro({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-matu-runtime",
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
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CTMT",
  },
};

export const viewport: Viewport = {
  themeColor: "#FFF6ED",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="vi"
      className={cn(fontMono.variable, fontMatuBody.variable, "font-sans")}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeScript defaultTheme="light" />
        <a
          href="#main-content"
          className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          {messages.common.skipNavigation}
        </a>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <BoneyardRegistry />
          <SerwistProvider
            swUrl="/sw.js"
            disable={process.env.NODE_ENV === "development"}
          >
            <TooltipProvider>{children}</TooltipProvider>
          </SerwistProvider>
          <NotificationBellFloating />
          <ResponsiveToaster />
          <ConfirmDialogProvider />
        </ThemeProvider>
      </body>
    </html>
  );
}
