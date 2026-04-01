import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-be-vietnam-pro",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cơm Tấm Má Tư",
  description: "Hệ thống quản lý nhà hàng Cơm Tấm Má Tư",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={beVietnamPro.variable} suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
