import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist } from "next/font/google";
import { Toaster } from "@comtammatu/ui/components/sonner";
import "./globals.css";

const geist = Geist({
  subsets: ["latin", "latin-ext"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cơm Tấm Má Tư",
  description: "Hệ thống quản lý nhà hàng Cơm Tấm Má Tư",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#ffffff" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={geist.variable} suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <a
          href="#main-content"
          className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Bỏ qua điều hướng
        </a>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
