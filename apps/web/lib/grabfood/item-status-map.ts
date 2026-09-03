import {
  GRAB_MENU_MAPPING,
  normalizeMenuName,
  type GrabMappingItem,
} from "./mapping";

export type GrabItemStatus =
  | "AVAILABLE"
  | "UNAVAILABLE_TODAY"
  | "UNAVAILABLE_INDEFINITELY"
  | "HIDDEN";
export type GrabItemAvailableStatus = 1 | 2 | 3 | 7;
export type GrabModifierStatus = "AVAILABLE" | "UNAVAILABLE_TODAY";
export type GrabModifierAvailableStatus = 1 | 2;

export interface MenuLimitAvailabilityRow {
  menu_item_id: number;
  item_name: string;
  is_disabled: boolean;
  available_to_sell: number | null;
  sold_today?: number;
  stock_capacity: number | null;
  manual_limit_quantity: number | null;
}

export interface GrabIdBucket {
  itemIds: string[];
  modifierIds: string[];
}

export interface GrabItemStatusSyncItem {
  menu_item_id: number;
  name: string;
  mapped: boolean;
  grab_item_id: string | null;
  grab_item_ids: string[];
  grab_modifier_ids: string[];
  is_disabled: boolean;
  available_to_sell: number | null;
  available_status: GrabItemAvailableStatus;
  grab_status: GrabItemStatus;
  item_available_status: GrabItemAvailableStatus;
  item_grab_status: GrabItemStatus;
  modifier_available_status: GrabModifierAvailableStatus;
  modifier_grab_status: GrabModifierStatus;
  stock_capacity: number | null;
  max_stock: number;
}

export interface GrabItemStatusPayload {
  items: GrabItemStatusSyncItem[];
  unmapped_items: Array<{ menu_item_id: number; name: string }>;
}

function emptyBucket(): GrabIdBucket {
  return { itemIds: [], modifierIds: [] };
}

function addGrabId(bucket: GrabIdBucket, grabId: string): void {
  if (grabId.startsWith("VNITE") && !bucket.itemIds.includes(grabId)) {
    bucket.itemIds.push(grabId);
  }
  if (grabId.startsWith("VNMOD") && !bucket.modifierIds.includes(grabId)) {
    bucket.modifierIds.push(grabId);
  }
}

export function indexGrabMenuMapping(
  mapping: Record<string, GrabMappingItem> = GRAB_MENU_MAPPING,
): Map<string, GrabIdBucket> {
  const nameToGrabIds = new Map<string, GrabIdBucket>();

  const indexName = (name: string, grabId: string) => {
    const normalized = normalizeMenuName(name);
    if (!normalized) return;
    const ids = nameToGrabIds.get(normalized) ?? emptyBucket();
    addGrabId(ids, grabId);
    nameToGrabIds.set(normalized, ids);
  };

  for (const [grabId, item] of Object.entries(mapping)) {
    indexName(item.name, grabId);
    if (item.variantName) {
      indexName(item.variantName, grabId);
    }
  }

  return nameToGrabIds;
}

export function mapLimitRowAvailability(row: MenuLimitAvailabilityRow): {
  itemGrabStatus: GrabItemStatus;
  itemAvailableStatus: GrabItemAvailableStatus;
  modifierGrabStatus: GrabModifierStatus;
  modifierAvailableStatus: GrabModifierAvailableStatus;
} {
  let itemGrabStatus: GrabItemStatus;
  let itemAvailableStatus: GrabItemAvailableStatus;

  if (row.is_disabled) {
    itemGrabStatus = "UNAVAILABLE_INDEFINITELY";
    itemAvailableStatus = 3;
  } else if (row.available_to_sell === 0) {
    itemGrabStatus = "UNAVAILABLE_TODAY";
    itemAvailableStatus = 2;
  } else {
    itemGrabStatus = "AVAILABLE";
    itemAvailableStatus = 1;
  }

  if (row.is_disabled || row.available_to_sell === 0) {
    return {
      itemGrabStatus,
      itemAvailableStatus,
      modifierGrabStatus: "UNAVAILABLE_TODAY",
      modifierAvailableStatus: 2,
    };
  }

  return {
    itemGrabStatus,
    itemAvailableStatus,
    modifierGrabStatus: "AVAILABLE",
    modifierAvailableStatus: 1,
  };
}

export function mapLimitRowsToGrabSyncItems(
  rows: MenuLimitAvailabilityRow[],
  mapping: Record<string, GrabMappingItem> = GRAB_MENU_MAPPING,
): GrabItemStatusPayload {
  const nameToGrabIds = indexGrabMenuMapping(mapping);

  const items = rows.map((row) => {
    const grabIds = nameToGrabIds.get(normalizeMenuName(row.item_name)) ??
      emptyBucket();
    const availability = mapLimitRowAvailability(row);
    const mapped = grabIds.itemIds.length > 0 || grabIds.modifierIds.length > 0;
    const maxStock =
      row.stock_capacity ??
      row.manual_limit_quantity ??
      (row.available_to_sell != null
        ? Math.max(row.available_to_sell, 100)
        : -1);

    return {
      menu_item_id: row.menu_item_id,
      name: row.item_name,
      mapped,
      grab_item_id: grabIds.itemIds[0] ?? null,
      grab_item_ids: grabIds.itemIds,
      grab_modifier_ids: grabIds.modifierIds,
      is_disabled: row.is_disabled,
      available_to_sell: row.available_to_sell,
      available_status: availability.itemAvailableStatus,
      grab_status: availability.itemGrabStatus,
      item_available_status: availability.itemAvailableStatus,
      item_grab_status: availability.itemGrabStatus,
      modifier_available_status: availability.modifierAvailableStatus,
      modifier_grab_status: availability.modifierGrabStatus,
      stock_capacity: row.stock_capacity,
      max_stock: maxStock,
    };
  });

  return {
    items,
    unmapped_items: items
      .filter((item) => !item.mapped)
      .map((item) => ({
        menu_item_id: item.menu_item_id,
        name: item.name,
      })),
  };
}
