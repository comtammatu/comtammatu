import type { ReactNode } from "react";
import { loadAuthState } from "@/_lib/auth";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { claims } = await loadAuthState();

  return (
    <div className="space-y-4">
      <SettingsNav role={claims.user_role} />
      {children}
    </div>
  );
}
