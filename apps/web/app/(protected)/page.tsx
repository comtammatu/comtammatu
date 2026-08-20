import { connection } from "next/server";
import { canAccess } from "@comtammatu/shared/auth";
import { ControlSurfaceOverview } from "@/_components/control-surface-overview";
import { loadAuthState } from "@/_lib/auth";
import { loadControlHomeAttention } from "@/_lib/control-home-attention";
import {
  getTodayWorkState,
  type TodayWorkState,
} from "@lib/staff-runtime/_lib/today-work-state";

async function loadTodayWorkForHome(
  role: Parameters<typeof canAccess>[0],
): Promise<TodayWorkState | null> {
  if (!canAccess(role, "me")) return null;
  try {
    return await getTodayWorkState();
  } catch {
    return null;
  }
}

export default async function RootPage() {
  // Attention buckets call Supabase during render; defer until request time
  // so Cache Components prerender does not abort in-flight fetch() calls.
  await connection();
  const { claims } = await loadAuthState();
  const [attention, todayWork] = await Promise.all([
    loadControlHomeAttention(claims.user_role),
    loadTodayWorkForHome(claims.user_role),
  ]);

  return (
    <ControlSurfaceOverview
      role={claims.user_role}
      attention={attention}
      todayWork={todayWork}
    />
  );
}
