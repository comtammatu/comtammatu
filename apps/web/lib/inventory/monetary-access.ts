import "server-only";

import {
  PERMISSION_KEYS,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { currentUserHasPermissionAny } from "@/_lib/permissions";

export type InventoryMonetaryAccess = {
  purchasePrice: boolean;
  valuation: boolean;
  systemValuation: boolean;
  client: ReturnType<typeof createServiceClient> | null;
};

export async function loadInventoryMonetaryAccess(
  role: StaffRole,
): Promise<InventoryMonetaryAccess> {
  if (
    role !== "owner" &&
    role !== "accountant" &&
    role !== "central_supply_ops"
  ) {
    return {
      purchasePrice: false,
      valuation: false,
      systemValuation: false,
      client: null,
    };
  }

  const [purchasePrice, valuation] = await Promise.all([
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_PRICE_LIST_READ),
    currentUserHasPermissionAny(PERMISSION_KEYS.INVENTORY_VALUATION_READ),
  ]);

  return {
    purchasePrice,
    valuation,
    systemValuation: role === "owner" && valuation,
    client: purchasePrice || valuation ? createServiceClient() : null,
  };
}
