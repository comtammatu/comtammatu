import { Inter } from "next/font/google";
import { DemoSidebar } from "./_components/demo-sidebar";
import { DemoHeader } from "./_components/demo-header";
import "./demo-theme.css";

const inter = Inter({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-inter",
});

export default function InventoryDemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`demo-inventory-theme ${inter.variable} flex h-dvh overflow-hidden`}
      style={{
        fontFamily: "var(--font-inter), sans-serif",
        backgroundColor: "var(--md-surface)",
      }}
    >
      <DemoSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <DemoHeader />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
