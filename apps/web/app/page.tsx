import { loadAuthState } from "@/_lib/auth";
import { ControlSurfaceShell } from "@/components/control-surface-shell";
import { OwnerOverview } from "./_components/owner-overview";

export default async function RootPage() {
  const { session, claims } = await loadAuthState();

  return (
    <ControlSurfaceShell
      module="owner"
      user={{
        name:
          session.user.user_metadata?.["display_name"] ??
          session.user.email ??
          "",
      }}
      role={claims.user_role}
      homeBranchId={claims.branch_id}
    >
      <OwnerOverview />
    </ControlSurfaceShell>
  );
}
