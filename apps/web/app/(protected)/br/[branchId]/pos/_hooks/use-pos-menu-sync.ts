"use client";

import { useEffect, useRef } from "react";
import {
  canSubscribeBranchOpsTopic,
  extractClaimsFromAccessToken,
} from "@comtammatu/shared/auth";
import {
  stopRealtimeAuthorizationRejoin,
  useRealtimeChannel,
} from "@/_hooks/use-realtime-channel";
import { makeRealtimeCoalescer } from "@/_utils/realtime-scheduler";
import { fetchMenuForPos } from "../actions";
import type { MenuCategory } from "../pos-menu-types";

const SELF_ORDER_OPS_TABLES = new Set([
  "self_order_requests",
  "self_order_payment_requests",
  "self_order_staff_calls",
]);

export interface UsePosMenuSyncArgs {
  branchId: number;
  setCategories: React.Dispatch<React.SetStateAction<MenuCategory[]>>;
  /** Thin branch-ops signal for QR self-order / payment-call refresh. */
  onSelfOrderSignal?: () => void;
}

export function usePosMenuSync({
  branchId,
  setCategories,
  onSelfOrderSignal,
}: UsePosMenuSyncArgs) {
  const setCategoriesRef = useRef(setCategories);
  const onSelfOrderSignalRef = useRef(onSelfOrderSignal);
  const didInitialSubscribeRef = useRef(false);

  useEffect(() => {
    setCategoriesRef.current = setCategories;
  }, [setCategories]);

  useEffect(() => {
    onSelfOrderSignalRef.current = onSelfOrderSignal;
  }, [onSelfOrderSignal]);

  useEffect(() => {
    didInitialSubscribeRef.current = false;
  }, [branchId]);

  useRealtimeChannel(
    (supabase, token) => {
      const claims = extractClaimsFromAccessToken(token);
      if (!claims || !canSubscribeBranchOpsTopic(claims, branchId)) {
        return null;
      }

      const runMenuRefetch = async () => {
        try {
          const res = await fetchMenuForPos(branchId, true);
          if (res.success && Array.isArray(res.data)) {
            setCategoriesRef.current(res.data as MenuCategory[]);
          }
        } catch (err) {
          console.error("Refetch POS menu failed:", err);
        }
      };
      // Coalesce bursts (a pos + stock_levels event storm) to <=2 full-menu
      // refetches, since the menu is the heaviest POS fetch.
      const handleMenuRefetch = makeRealtimeCoalescer(
        runMenuRefetch,
        undefined,
        { metricName: "pos.menu.refresh" },
      );

      const channel = supabase.channel(`branch:${String(branchId)}:ops`, {
        config: { broadcast: { self: false }, private: true },
      });
      channel.on("broadcast", { event: "ops" }, (payload) => {
        const event = payload.payload as
          | { domain?: string; table?: string }
          | undefined;
        const table = typeof event?.table === "string" ? event.table : null;
        if (table !== null && SELF_ORDER_OPS_TABLES.has(table)) {
          onSelfOrderSignalRef.current?.();
        }
        if (
          event?.domain === "pos" ||
          (event?.domain === "inventory" && event?.table === "stock_levels")
        ) {
          handleMenuRefetch();
        }
      });
      channel.subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          stopRealtimeAuthorizationRejoin(supabase, channel, err);
          return;
        }
        if (status !== "SUBSCRIBED") return;
        if (!didInitialSubscribeRef.current) {
          didInitialSubscribeRef.current = true;
          return;
        }
        // Reconnect catch-up: menu silent re-sync + self-order snapshot refresh.
        void runMenuRefetch();
        onSelfOrderSignalRef.current?.();
      });
      return channel;
    },
    [branchId],
  );
}
