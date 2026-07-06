"use client";

import { useMemo, useState } from "react";
import { usePosMenuSync } from "./_hooks/use-pos-menu-sync";
import { PosDesktopInner } from "./pos-desktop-inner";
import type { OrderType } from "./types";
import type { MenuCategory, MenuItem } from "./pos-menu-types";
import type { ActiveSession, BranchTable } from "./page";
import type { PaymentMethod } from "@comtammatu/shared/providers";
import type { VietQrConfig } from "./payment-actions";
import type { SessionOrder } from "./order-history";
import { PosDesktopProvider } from "./_providers/pos-desktop-provider";
import type { DailyLimitsMap } from "./_providers/pos-desktop-provider";

interface PosDesktopShellProps {
  branchId: number;
  categories: MenuCategory[];
  tables: BranchTable[];
  session: ActiveSession;
  initialOrderType: OrderType;
  /** Orders prefetched by RSC. Seeds provider state to skip mount-time refetch. */
  initialOrders: SessionOrder[];
  /**
   * True when RSC `fetchSessionOrders` succeeded. Lets the realtime hook skip
   * its first SUBSCRIBED catch-up refresh (already covered by the RSC seed).
   * False when RSC fetch failed → fall back to old behavior, first SUBSCRIBED
   * fires a full refresh as recovery.
   */
  initialOrdersSeeded: boolean;
  /** Optional deep link from durable notifications: /pos?order=<id>. */
  initialOpenOrderId?: number;
  /** User hiện tại có `pos:close_shift` không. */
  canCloseShift: boolean;
  /** `pos:confirm_payment` — gate phương thức"Tiền mặt" trên bill (cashier+). */
  canConfirmCash: boolean;
  /** Tenant `pos_split_merge_enabled` — hides split/merge entries when off. */
  canSplitMerge: boolean;
  /** Tenant payment methods seeded từ RSC — bill render không phải đợi fetch. */
  initialPaymentMethods: readonly PaymentMethod[];
  /** Tenant VietQR config seeded từ RSC; null nếu disable / chưa cấu hình. */
  initialVietQrConfig: VietQrConfig | null;
}

export function PosDesktopShell(props: PosDesktopShellProps) {
  const [categories, setCategories] = useState(props.categories);

  usePosMenuSync({
    branchId: props.branchId,
    setCategories,
  });

  // Extract the volatile slice (sold_today / is_disabled / available_to_sell)
  // from RSC's `fetchMenuForPos` snapshot so the provider can patch it in
  // real time via `useDailyLimitSync` without re-fetching the whole menu
  // structure on each event. Items without a limit row simply aren't keys.
  const initialDailyLimits = useMemo<DailyLimitsMap>(() => {
    const map = new Map<number, NonNullable<MenuItem["daily_limit"]>>();
    for (const category of categories) {
      for (const item of category.menu_items) {
        if (item.daily_limit) {
          map.set(item.id, item.daily_limit);
        }
      }
    }
    return map;
  }, [categories]);

  return (
    <PosDesktopProvider
      branchId={props.branchId}
      session={props.session}
      initialTables={props.tables}
      initialOrderType={props.initialOrderType}
      initialOrders={props.initialOrders}
      initialOrdersSeeded={props.initialOrdersSeeded}
      initialDailyLimits={initialDailyLimits}
    >
      <PosDesktopInner
        categories={categories}
        canCloseShift={props.canCloseShift}
        canConfirmCash={props.canConfirmCash}
        canSplitMerge={props.canSplitMerge}
        initialPaymentMethods={props.initialPaymentMethods}
        initialVietQrConfig={props.initialVietQrConfig}
        initialOpenOrderId={props.initialOpenOrderId}
      />
    </PosDesktopProvider>
  );
}
