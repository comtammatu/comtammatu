import { loadAuthState } from "@/_lib/auth";
import { OwnerModuleShell } from "@/components/owner-module-shell";
import { OwnerOverview } from "./_components/owner-overview";

export default async function RootPage() {
  const { session, claims } = await loadAuthState();

  return (
    <OwnerModuleShell
      module="owner"
      user={{
        name:
          session.user.user_metadata?.["display_name"] ??
          session.user.email ??
          "",
      }}
      role={claims.user_role}
      branchId={claims.branch_id}
    >
      <OwnerOverview />
    </OwnerModuleShell>
  );
}
