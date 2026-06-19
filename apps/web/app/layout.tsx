import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Script from "next/script";
import { ConfirmDialogProvider } from "@comtammatu/ui/components/confirm-dialog";
import { ThemeProvider } from "@comtammatu/ui/components/theme-provider";
import { getThemeScriptHtml } from "@comtammatu/ui/components/theme-script";
import { TooltipProvider } from "@comtammatu/ui/components/tooltip";
import { ResponsiveToaster } from "./_components/responsive-toaster";
import { DevServiceWorkerReset } from "./dev-service-worker-reset";
import { SerwistProvider } from "./serwist-provider";
import "@comtammatu/ui/globals.css";
import { cn } from "@/lib/utils";
import { messages } from "@lib/messages";

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
    title: "Má Tư",
  },
};

export const viewport: Viewport = {
  themeColor: "#fff6ee",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="vi"
      className={cn(GeistSans.variable, GeistMono.variable, "font-sans")}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Script
          id="theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: getThemeScriptHtml({ forcedTheme: "light" }),
          }}
        />
        <a
          href="#main-content"
          className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          {messages.common.skipNavigation}
        </a>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          forcedTheme="light"
          disableTransitionOnChange
        >
          <SerwistProvider
            swUrl="/sw.js"
            disable={process.env.NODE_ENV === "development"}
          >
            <TooltipProvider>{children}</TooltipProvider>
          </SerwistProvider>
          {process.env.NODE_ENV === "development" ? (
            <DevServiceWorkerReset />
          ) : null}
          <ResponsiveToaster />
          <ConfirmDialogProvider />
        </ThemeProvider>
      </body>
    </html>
  );
}
