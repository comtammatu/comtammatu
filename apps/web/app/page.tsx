import { loadAuthState } from "@/_lib/auth";
import { ControlSurfaceShell } from "@/components/control-surface-shell";
import { OwnerOverview } from "./_components/owner-overview";

export default async function RootPage() {
  const { user, claims } = await loadAuthState();

  return (
    <ControlSurfaceShell
      module="owner"
      user={{
        name:
          user?.user_metadata?.["display_name"] ??
          user?.email ??
          "",
      }}
      role={claims.user_role}
      homeBranchId={claims.branch_id}
    >
      <OwnerOverview />
    </ControlSurfaceShell>
  );
}
