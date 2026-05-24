import type { ReactNode } from "react";
import { loadAuthState } from "@/_lib/auth";
import { HRShell } from "./components/hr-shell";

export default async function HRLayout({ children }: { children: ReactNode }) {
  const { session, claims } = await loadAuthState();

  return (
    <HRShell
      user={{
        name:
          session.user.user_metadata?.["display_name"] ??
          session.user.email ??
          "",
      }}
      role={claims.user_role}
    >
      {children}
    </HRShell>
  );
}
