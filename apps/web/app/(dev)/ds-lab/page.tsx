import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DesignLabClient } from "./ds-lab-client";

// Internal Má Tư Design System lab. Not a product surface: it renders no
// tenant data, is excluded from navigation, and 404s outside development so a
// production build never exposes it. It sits outside (protected) on purpose —
// `/ds-lab` resolves to no ModuleKey and is not an owner route prefix, so
// proxy.ts lets any authenticated session through without an ACL decision.
export const metadata: Metadata = {
  title: "Design System Lab",
  robots: { index: false, follow: false },
};

export default function DsLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignLabClient />;
}
