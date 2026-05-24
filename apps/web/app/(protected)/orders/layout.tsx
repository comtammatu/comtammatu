import type { ReactNode } from "react";
import { loadAuthState } from "@/_lib/auth";
import { OrdersShell } from "./components/orders-shell";

export default async function OrdersLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { session, claims } = await loadAuthState();

  return (
    <OrdersShell
      user={{
        name:
          session.user.user_metadata?.["display_name"] ??
          session.user.email ??
          "",
      }}
      role={claims.user_role}
    >
      {children}
    </OrdersShell>
  );
}
