import { OwnerOverview } from "@/_components/owner-overview";
import { loadAuthState } from "@/_lib/auth";
import { loadControlHomeAttention } from "@/_lib/control-home-attention";

export default async function RootPage() {
  const { claims } = await loadAuthState();
  const attention = await loadControlHomeAttention(claims.user_role);

  return <OwnerOverview role={claims.user_role} attention={attention} />;
}
