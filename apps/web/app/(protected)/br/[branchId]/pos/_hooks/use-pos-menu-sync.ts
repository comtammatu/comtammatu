"use client";

import { useEffect, useRef } from "react";
import { subscribeBranchOps } from "@/_hooks/branch-ops-runtime";
import { makeRealtimeCoalescer } from "@/_utils/realtime-scheduler";
import { dedupeInflight } from "@/_utils/inflight-dedupe";
import { fetchMenuForPos } from "../actions";
import type { MenuCategory } from "../pos-menu-types";

const POS_MENU_OPS_TABLES = ["stock_levels"] as const;
const SELF_ORDER_OPS_TABLES = [
  "self_order_requests",
  "self_order_payment_requests",
  "self_order_staff_calls",
] as const;

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

  useEffect(() => {
    setCategoriesRef.current = setCategories;
  }, [setCategories]);

  useEffect(() => {
    onSelfOrderSignalRef.current = onSelfOrderSignal;
  }, [onSelfOrderSignal]);

  useEffect(() => {
    let cancelled = false;
    const runMenuRefetch = async () => {
      if (cancelled) return;
      try {
        const res = await dedupeInflight(
          `fetchMenuForPos:${String(branchId)}`,
          () => fetchMenuForPos(branchId, true),
        );
        if (cancelled) return;
        if (res.success && Array.isArray(res.data)) {
          setCategoriesRef.current(res.data as MenuCategory[]);
        }
      } catch (err) {
        console.error("Refetch POS menu failed:", err);
      }
    };
    const handleMenuRefetch = makeRealtimeCoalescer(
      runMenuRefetch,
      undefined,
      { metricName: "pos.menu.refresh" },
    );

    const stopMenuByDomain = subscribeBranchOps({
      branchId,
      filter: { domains: ["pos"] },
      onInvalidate: handleMenuRefetch,
    });
    const stopMenuByStock = subscribeBranchOps({
      branchId,
      filter: { tables: [...POS_MENU_OPS_TABLES] },
      onInvalidate: handleMenuRefetch,
    });
    const stopSelfOrder = subscribeBranchOps({
      branchId,
      filter: { tables: [...SELF_ORDER_OPS_TABLES] },
      onInvalidate: () => {
        if (!cancelled) onSelfOrderSignalRef.current?.();
      },
    });

    return () => {
      cancelled = true;
      stopMenuByDomain();
      stopMenuByStock();
      stopSelfOrder();
    };
  }, [branchId]);
}
