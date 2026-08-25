import { createHash } from "node:crypto";

/**
 * GrabFood Menu Mapping and Order Transformation Dictionary
 * Maps Grab item IDs and modifier IDs to canonical Com Tam Ma Tu names and items.
 */

export interface GrabMappingItem {
  name: string;
  defaultPrice: number;
  category?: string;
}

export const GRAB_MENU_MAPPING: Record<string, GrabMappingItem> = {
  // Món Chính (Cơm)
  "VNITE20260818044418231553": { name: "Sườn Cốt Lết", defaultPrice: 54000, category: "Cơm" },
  "VNITE20260818044418223602": { name: "Sườn Cọng", defaultPrice: 78000, category: "Cơm" },
  "VNITE20260818044418217365": { name: "Sườn Một Gang", defaultPrice: 120000, category: "Cơm" },
  "VNITE20260818044418050935": { name: "Cơm Tấm Bì", defaultPrice: 30000, category: "Món khác" },
  "VNITE20260818044418079946": { name: "Cơm Tấm Chả", defaultPrice: 30000, category: "Món khác" },
  "VNITE20260818044418097874": { name: "Cơm Tấm Trứng", defaultPrice: 30000, category: "Món khác" },
  "VNITE20260818044418041272": { name: "Cơm Tấm Thêm", defaultPrice: 6000, category: "Món khác" },

  // Món Ăn Kèm (Sides)
  "VNITE20260818044418086205": { name: "Tóp Mỡ", defaultPrice: 6000, category: "Ăn kèm" },
  "VNITE20260818044418119394": { name: "Trứng", defaultPrice: 10000, category: "Ăn kèm" },
  "VNITE20260818044418028323": { name: "Chả", defaultPrice: 12000, category: "Ăn kèm" },
  "VNITE20260818044418061788": { name: "Bì", defaultPrice: 12000, category: "Ăn kèm" },

  // Canh
  "VNITE20260818044418190698": { name: "Canh Khổ Qua", defaultPrice: 30000, category: "Canh" },
  "VNITE20260818044418205769": { name: "Canh Chua Tôm", defaultPrice: 30000, category: "Canh" },

  // Nước Mát & Nước Ngọt
  "VNITE20260818044418160992": { name: "Khăn lạnh", defaultPrice: 3000, category: "Nước mát" },
  "VNITE20260818044418179985": { name: "Trà đá", defaultPrice: 4000, category: "Nước mát" },
  "VNITE20260818044418135461": { name: "Nước Suối", defaultPrice: 15000, category: "Nước mát" },
  "VNITE20260818044418156935": { name: "Nước Sâm", defaultPrice: 25000, category: "Nước mát" },
  "VNITE20260818044418185196": { name: "Nước Cam Ép", defaultPrice: 25000, category: "Nước mát" },
  "VNITE20260818044418148750": { name: "Trà Tắc", defaultPrice: 25000, category: "Nước mát" },
  "VNITE20260818044418122792": { name: "Rau Má Sữa", defaultPrice: 25000, category: "Nước mát" },
  "VNITE20260818044418019423": { name: "Coca", defaultPrice: 25000, category: "Nước ngọt" },
  "VNITE20260818044418031815": { name: "Sprite", defaultPrice: 25000, category: "Nước ngọt" },
  "VNITE20260818044418101606": { name: "Fanta Xá Xị", defaultPrice: 25000, category: "Nước ngọt" },
  "VNITE2026082106443494069": { name: "Fanta Cam", defaultPrice: 25000, category: "Nước ngọt" },

  // Món thêm
  "VNMOD20260819110228013409": { name: "Dụng cụ mang về", defaultPrice: 3000 },
  "VNMOD20260821070648011245": { name: "Tóp mỡ", defaultPrice: 6000 },
  "VNMOD20260819110649013214": { name: "Cơm thêm", defaultPrice: 6000 },
  "VNMOD20260819110119013328": { name: "Trứng", defaultPrice: 10000 },
  "VNMOD20260819110119020027": { name: "Chả", defaultPrice: 12000 },
  "VNMOD20260819110119033709": { name: "Bì", defaultPrice: 12000 },
};

/** Normalizes a string for case/accent-insensitive lookup */
export function normalizeMenuName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

/**
 * Generates a deterministic UUID from Grab's orderID for idempotency key
 */
export function generateOrderUuid(orderId: string): string {
  const hash = createHash("sha256").update(`grabfood-${orderId}`).digest("hex");
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    `4${hash.substring(13, 16)}`, // set version 4
    `8${hash.substring(17, 20)}`, // set variant 10xx
    hash.substring(20, 32),
  ].join("-");
}

export interface GrabOrderItemRaw {
  itemID?: string;
  name: string;
  quantity: number;
  comment?: string | null;
  fare?: {
    priceDisplay?: string;
    originalItemPriceDisplay?: string;
    priceFloat?: number;
    priceInMin?: number;
  };
  modifierGroups?: Array<{
    modifierGroupID?: string;
    modifierGroupName?: string;
    modifiers?: Array<{
      modifierID?: string;
      modifierName?: string;
      priceDisplay?: string;
      quantity?: number;
    }>;
  }>;
}

export interface GrabOrderRaw {
  orderID: string;
  displayID: string;
  merchant?: { ID?: string };
  eater?: {
    name?: string;
    mobileNumber?: string;
    comment?: string;
  };
  itemInfo?: {
    items?: GrabOrderItemRaw[];
  };
  fare?: {
    subTotalDisplay?: string;
    totalDisplay?: string;
  };
  paymentMethod?: string;
  cutlery?: number;
}

export interface TransformedOrderForRpc {
  orderId: string;
  idempotencyKey: string;
  displayId: string;
  merchantId?: string;
  customerNote: string;
  paymentMethod: "platform";
  subtotal: number;
  totalAmount: number;
  items: Array<{
    menu_item_id: number;
    item_name: string;
    quantity: number;
    unit_price: number;
    modifiers: Array<{ name: string; price: number; modifier_id?: number | null }>;
    sides: Array<{ name: string; price: number; quantity: number; side_item_id?: number | null }>;
    subtotal: number;
    note: string | null;
  }>;
}

/**
 * Matches an item from Grab to a database MenuItem
 */
export function matchMenuItem(
  grabItem: GrabOrderItemRaw,
  dbItems: Array<{ id: number; name: string; base_price: number }>,
): { id: number; name: string; base_price: number } {
  // 1. Direct ID lookup in mapping
  const mapped = grabItem.itemID ? GRAB_MENU_MAPPING[grabItem.itemID] : null;
  const targetName = mapped?.name || grabItem.name;
  const normalizedTarget = normalizeMenuName(targetName);

  // 2. Lookup in DB items by exact or normalized name
  const matchedDb = dbItems.find(
    (dbi) => normalizeMenuName(dbi.name) === normalizedTarget || dbi.name.toLowerCase() === targetName.toLowerCase(),
  );

  if (matchedDb) {
    return matchedDb;
  }

  // 3. Fallback to mapped default if found, otherwise throw explicit unmapped error
  if (mapped) {
    const fallbackDb = dbItems.find((d) => normalizeMenuName(d.name).includes(normalizeMenuName(mapped.name)));
    if (fallbackDb) return fallbackDb;
  }

  throw new Error(`Món "${grabItem.name}" (ID: ${grabItem.itemID || "N/A"}) chưa được ánh xạ trong thực đơn quán`);
}

/**
 * Transforms incoming Grab order payload into RPC-ready items structure
 */
export function transformGrabOrderPayload(
  grabOrder: GrabOrderRaw,
  dbItems: Array<{ id: number; name: string; base_price: number }>,
): TransformedOrderForRpc {
  const items = (grabOrder.itemInfo?.items || []).map((gi) => {
    const matched = matchMenuItem(gi, dbItems);

    const modifiers: Array<{ name: string; price: number }> = [];
    if (Array.isArray(gi.modifierGroups)) {
      for (const grp of gi.modifierGroups) {
        if (Array.isArray(grp.modifiers)) {
          for (const mod of grp.modifiers) {
            const rawPrice = mod.priceDisplay?.replace(/[^\d]/g, "") || "0";
            const price = parseInt(rawPrice, 10) || 0;
            const mappedMod = mod.modifierID ? GRAB_MENU_MAPPING[mod.modifierID] : null;
            const name = mappedMod?.name || mod.modifierName || grp.modifierGroupName || "Món thêm";
            modifiers.push({ name, price });
          }
        }
      }
    }

    const modifierSum = modifiers.reduce((acc, m) => acc + m.price, 0);
    const unitPrice = matched.base_price + modifierSum;
    const subtotal = unitPrice * (gi.quantity || 1);

    return {
      menu_item_id: matched.id,
      item_name: matched.name,
      quantity: gi.quantity || 1,
      unit_price: unitPrice,
      modifiers: modifiers,
      sides: [],
      subtotal: subtotal,
      note: gi.comment || null,
    };
  });

  const eaterName = grabOrder.eater?.name || "Khách Grab";
  const eaterPhone = grabOrder.eater?.mobileNumber || "";
  const cutleryNote = grabOrder.cutlery === 2 ? " • Lấy muỗng đũa" : "";
  const customerNote = `[GrabFood ${grabOrder.displayID}] ${eaterName} (${eaterPhone})${cutleryNote}`;

  const rawSubtotal = grabOrder.fare?.subTotalDisplay?.replace(/[^\d]/g, "") || "0";
  const rawTotal = grabOrder.fare?.totalDisplay?.replace(/[^\d]/g, "") || rawSubtotal;

  return {
    orderId: grabOrder.orderID,
    idempotencyKey: generateOrderUuid(grabOrder.orderID),
    displayId: grabOrder.displayID,
    merchantId: grabOrder.merchant?.ID,
    customerNote,
    paymentMethod: "platform",
    subtotal: parseInt(rawSubtotal, 10) || items.reduce((acc, i) => acc + i.subtotal, 0),
    totalAmount: parseInt(rawTotal, 10) || items.reduce((acc, i) => acc + i.subtotal, 0),
    items,
  };
}
