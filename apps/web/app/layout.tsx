import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { cookies } from "next/headers";

import Script from "next/script";
import { ConfirmDialogProvider } from "@/components/confirm-dialog";
import { ThemeProvider } from "@comtammatu/ui/components/theme-provider";
import { getThemeScriptHtml } from "@comtammatu/ui/components/theme-script";
import { TooltipProvider } from "@comtammatu/ui/components/tooltip";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ResponsiveToaster } from "./_components/responsive-toaster";
import { DevServiceWorkerReset } from "./dev-service-worker-reset";
import { SerwistProvider } from "./serwist-provider";
import "@comtammatu/ui/globals.css";
import { cn } from "@comtammatu/ui";
import { messages } from "@lib/messages";
import { themeClassName } from "@comtammatu/ui/lib/theme-cookie";
import {
  BROWSER_CHROME_THEME_COLORS,
  THEME_COOKIE_NAME,
  resolveThemeMode,
} from "./_lib/theme-tokens";

export const instant = false;

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
    statusBarStyle: "black-translucent",
    title: "Má Tư",
  },
};

// Dynamic themeColor: read the `matu-theme` cookie so the browser chrome
// matches the resolved theme from the very first SSR render (no flash).
export async function generateViewport(): Promise<Viewport> {
  const cookieStore = await cookies();
  const theme = cookieStore.get(THEME_COOKIE_NAME)?.value;
  const resolved = resolveThemeMode(theme) ?? "light";
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: BROWSER_CHROME_THEME_COLORS[resolved],
  };
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const cookieTheme = cookieStore.get(THEME_COOKIE_NAME)?.value;
  const resolvedCookie = resolveThemeMode(cookieTheme) ?? "light";
  const initialThemeClass = themeClassName(resolvedCookie);
  return (
    <html
      lang="vi"
      className={cn(
        GeistSans.variable,
        GeistMono.variable,
        initialThemeClass,
        "font-sans",
      )}
      style={{ colorScheme: initialThemeClass }}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <Script
          id="theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: getThemeScriptHtml({
              chromeColors: BROWSER_CHROME_THEME_COLORS,
            }),
          }}
        />
        <a
          href="#main-content"
          className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          {messages.common.skipNavigation}
        </a>
        <ThemeProvider
          defaultTheme={resolvedCookie}
          disableTransitionOnChange
        >
          <SerwistProvider
            swUrl="/sw.js"
            disable={
              process.env.NODE_ENV === "development" ||
              process.env.VERCEL_ENV === "preview"
            }
          >
            <TooltipProvider>{children}</TooltipProvider>
          </SerwistProvider>
          {process.env.NODE_ENV === "development" ? (
            <DevServiceWorkerReset />
          ) : null}
          <ResponsiveToaster />
          <ConfirmDialogProvider />
        </ThemeProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
