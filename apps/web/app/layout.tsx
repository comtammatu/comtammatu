import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono, Montserrat } from "next/font/google";
import { ConfirmDialogProvider } from "@comtammatu/ui/components/confirm-dialog";
import { ThemeProvider } from "@comtammatu/ui/components/theme-provider";
import { TooltipProvider } from "@comtammatu/ui/components/tooltip";
import { BoneyardRegistry } from "./_components/boneyard-registry";
import { NotificationBellFloating } from "./_components/notification-bell-floating";
import { ResponsiveToaster } from "./_components/responsive-toaster";
import { SerwistProvider } from "./serwist-provider";
import "@comtammatu/ui/globals.css";
import { cn } from "@/lib/utils";

const fontSans = Inter({
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-sans",
  display: "swap",
});

const fontHeading = Montserrat({
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-matu-heading",
  display: "swap",
});

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
    { media: "(prefers-color-scheme: light)", color: "#fff6ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1b2a" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="vi"
      className={cn(
        fontSans.variable,
        fontHeading.variable,
        fontMono.variable,
        "font-sans",
      )}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
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
