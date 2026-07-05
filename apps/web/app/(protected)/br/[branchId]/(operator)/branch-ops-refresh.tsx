"use client";

import { useRealtimeRefresh } from "@/_hooks/use-realtime-refresh";

/**
 * Live-refresh an inventory operator surface. Subscribes to the branch's
 * private ops broadcast (`branch:{id}:ops`, event `ops`) fed by the
 * `broadcast_branch_ops` DB trigger, and coalesces every inventory document
 * change (GRN/PO/transfer/issue/production/count/stocktake/return) into one
 * router.refresh(). A stock_transfer INSERT broadcasts to both the requesting
 * and fulfilling branch topics, so a goods request reaches the fulfilling
 * central branch (supply / kitchen) without a manual refresh. Renders nothing.
 *
 * The channel is `private: true` so `realtime.messages` RLS (policy
 * `branch_ops_receive`) gates receipt to branch members; useRealtimeChannel
 * defers subscribe until auth is hot so the socket registers as authenticated.
 */
export function BranchOpsRefresh({ branchId }: { branchId: number }) {
  useRealtimeRefresh({
    deps: [branchId],
    setupChannel: (supabase, scheduleRefresh) => {
      let initialSubscribe = true;
      return supabase
        .channel(`branch:${String(branchId)}:ops`, {
          config: { broadcast: { self: false }, private: true },
        })
        .on("broadcast", { event: "ops" }, () => scheduleRefresh())
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            if (initialSubscribe) {
              initialSubscribe = false;
              return;
            }
            // Reconnect: catch up on anything missed while disconnected.
            scheduleRefresh();
          }
        });
    },
  });

  return null;
}
