import { createHash } from "node:crypto";

/**
 * ShopeeFood Menu Mapping and Order Transformation Dictionary
 * Maps ShopeeFood / Shopee Partner item IDs and modifier IDs to canonical Com Tam Ma Tu items.
 */

export interface ShopeeMappingItem {
  name: string;
  defaultPrice: number;
  category?: string;
}

export const SHOPEE_MENU_MAPPING: Record<string, ShopeeMappingItem> = {
  // Món Chính (Cơm)
  "SPF_ITEM_SUON_COT_LET": { name: "Sườn Cốt Lết", defaultPrice: 54000, category: "Cơm" },
  "SPF_ITEM_SUON_CONG": { name: "Sườn Cọng", defaultPrice: 78000, category: "Cơm" },
  "SPF_ITEM_SUON_MOT_GANG": { name: "Sườn Một Gang", defaultPrice: 120000, category: "Cơm" },
  "SPF_ITEM_COM_BI": { name: "Cơm Tấm Bì", defaultPrice: 30000, category: "Món khác" },
  "SPF_ITEM_COM_CHA": { name: "Cơm Tấm Chả", defaultPrice: 30000, category: "Món khác" },
  "SPF_ITEM_COM_TRUNG": { name: "Cơm Tấm Trứng", defaultPrice: 30000, category: "Món khác" },
  "SPF_ITEM_COM_THEM": { name: "Cơm Tấm Thêm", defaultPrice: 6000, category: "Món khác" },

  // Món Ăn Kèm (Sides)
  "SPF_ITEM_TOP_MO": { name: "Tóp Mỡ", defaultPrice: 6000, category: "Ăn kèm" },
  "SPF_ITEM_TRUNG_OP_LA": { name: "Trứng", defaultPrice: 10000, category: "Ăn kèm" },
  "SPF_ITEM_CHA_TRUNG": { name: "Chả", defaultPrice: 12000, category: "Ăn kèm" },
  "SPF_ITEM_BI_HEO": { name: "Bì", defaultPrice: 12000, category: "Ăn kèm" },

  // Canh
  "SPF_ITEM_CANH_KHO_QUA": { name: "Canh Khổ Qua", defaultPrice: 30000, category: "Canh" },
  "SPF_ITEM_CANH_CHUA_TOM": { name: "Canh Chua Tôm", defaultPrice: 30000, category: "Canh" },

  // Nước Mát & Nước Ngọt
  "SPF_ITEM_KHAN_LANH": { name: "Khăn lạnh", defaultPrice: 3000, category: "Nước mát" },
  "SPF_ITEM_TRA_DA": { name: "Trà đá", defaultPrice: 4000, category: "Nước mát" },
  "SPF_ITEM_NUOC_SUOI": { name: "Nước Suối", defaultPrice: 15000, category: "Nước mát" },
  "SPF_ITEM_NUOC_SAM": { name: "Nước Sâm", defaultPrice: 25000, category: "Nước mát" },
  "SPF_ITEM_NUOC_CAM": { name: "Nước Cam Ép", defaultPrice: 25000, category: "Nước mát" },
  "SPF_ITEM_TRA_TAC": { name: "Trà Tắc", defaultPrice: 25000, category: "Nước mát" },
  "SPF_ITEM_RAU_MA": { name: "Rau Má Sữa", defaultPrice: 25000, category: "Nước mát" },
  "SPF_ITEM_COCA": { name: "Coca", defaultPrice: 25000, category: "Nước ngọt" },
  "SPF_ITEM_SPRITE": { name: "Sprite", defaultPrice: 25000, category: "Nước ngọt" },
  "SPF_ITEM_FANTA_XA_XI": { name: "Fanta Xá Xị", defaultPrice: 25000, category: "Nước ngọt" },
  "SPF_ITEM_FANTA_CAM": { name: "Fanta Cam", defaultPrice: 25000, category: "Nước ngọt" },

  // Món thêm
  "SPF_MOD_DUNG_CU": { name: "Dụng Cụ Mang Về", defaultPrice: 3000 },
  "SPF_MOD_TOP_MO": { name: "Tóp Mỡ", defaultPrice: 6000 },
  "SPF_MOD_COM_THEM": { name: "Cơm Tấm Thêm", defaultPrice: 6000 },
  "SPF_MOD_TRUNG": { name: "Trứng", defaultPrice: 10000 },
  "SPF_MOD_CHA": { name: "Chả", defaultPrice: 12000 },
  "SPF_MOD_BI": { name: "Bì", defaultPrice: 12000 },
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
 * Generates a deterministic UUID from Shopee's orderId for idempotency key
 */
export function generateOrderUuid(orderId: string): string {
  const hash = createHash("sha256").update(`shopeefood-${orderId}`).digest("hex");
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    `4${hash.substring(13, 16)}`, // set version 4
    `8${hash.substring(17, 20)}`, // set variant 10xx
    hash.substring(20, 32),
  ].join("-");
}

export interface ShopeeOrderItemRaw {
  itemId?: string | number;
  name: string;
  quantity: number;
  price?: number | string;
  originalPrice?: number | string;
  note?: string | null;
  options?: Array<{
    groupName?: string;
    optionId?: string | number;
    name?: string;
    price?: number | string;
    quantity?: number;
  }>;
  modifiers?: Array<{
    modifierId?: string | number;
    name?: string;
    price?: number | string;
    quantity?: number;
  }>;
}

export interface ShopeeOrderRaw {
  orderId?: string | number;
  orderCode?: string;
  displayId?: string;
  restaurantId?: string | number;
  restaurantName?: string;
  customer?: {
    name?: string;
    phone?: string;
    note?: string;
  };
  buyer?: {
    name?: string;
    phone?: string;
  };
  items?: ShopeeOrderItemRaw[];
  dishList?: ShopeeOrderItemRaw[];
  orderItems?: ShopeeOrderItemRaw[];
  subtotal?: number | string;
  total?: number | string;
  totalPrice?: number | string;
  deliveryFee?: number | string;
  paymentMethod?: string;
  needCutlery?: boolean | number;
  note?: string | null;
  merchantNote?: string | null;
}

export interface TransformedOrderForRpc {
  orderId: string;
  idempotencyKey: string;
  displayId: string;
  restaurantId?: string;
  customerNote: string;
  paymentMethod: string;
  subtotal: number;
  totalAmount: number;
  items: Array<{
    menu_item_id: number;
    item_name: string;
    quantity: number;
    unit_price: number;
    modifiers: Array<{ name: string; price: number; modifier_id?: number | null }>;
    sides: Array<{ name: string; price: number; quantity: number; side_item_id: number }>;
    subtotal: number;
    note: string | null;
  }>;
}

/**
 * Matches an item from ShopeeFood to a database MenuItem
 */
export function matchMenuItem(
  shopeeItem: ShopeeOrderItemRaw,
  dbItems: Array<{ id: number; name: string; base_price: number }>,
): { id: number; name: string; base_price: number } {
  // 1. Direct ID lookup in mapping
  const idStr = shopeeItem.itemId != null ? String(shopeeItem.itemId) : "";
  const mapped = idStr ? SHOPEE_MENU_MAPPING[idStr] : null;
  const targetName = mapped?.name || shopeeItem.name;
  const normalizedTarget = normalizeMenuName(targetName);

  // 2. Lookup in DB items by exact or normalized name
  const matchedDb = dbItems.find(
    (dbi) =>
      normalizeMenuName(dbi.name) === normalizedTarget ||
      dbi.name.toLowerCase() === targetName.toLowerCase(),
  );

  if (matchedDb) {
    return matchedDb;
  }

  // 3. Fallback to first available db item or fallback mock
  const fallback = dbItems[0] || {
    id: 1,
    name: targetName,
    base_price: mapped?.defaultPrice || 54000,
  };
  return {
    id: fallback.id,
    name: targetName,
    base_price: fallback.base_price,
  };
}

const SIDE_NAME_ALIASES: Record<string, string> = {
  "hop, muong, nia": "Dụng Cụ Mang Về",
  "hop muong nia": "Dụng Cụ Mang Về",
  "dung cu an uong": "Dụng Cụ Mang Về",
  "dung cu mang ve": "Dụng Cụ Mang Về",
  "top mo": "Tóp Mỡ",
  "com them": "Cơm Tấm Thêm",
  "trung": "Trứng",
  "cha": "Chả",
  "bi": "Bì",
};

/**
 * Matches a side option by name against database MenuItems
 */
export function matchSideItem(
  targetName: string,
  dbItems: Array<{ id: number; name: string; base_price: number }>,
): { id: number; name: string; base_price: number } | null {
  const normalizedTarget = normalizeMenuName(targetName);
  const alias = SIDE_NAME_ALIASES[normalizedTarget];
  const target = alias ? normalizeMenuName(alias) : normalizedTarget;

  const exact = dbItems.find(
    (dbi) =>
      normalizeMenuName(dbi.name) === target ||
      dbi.name.toLowerCase() === target ||
      normalizeMenuName(dbi.name) === normalizedTarget,
  );
  if (exact) return exact;

  return (
    dbItems.find((d) => {
      const norm = normalizeMenuName(d.name);
      return norm.includes(target) || target.includes(norm);
    }) || null
  );
}

function parseNumericPrice(value: number | string | undefined): number {
  if (typeof value === "number") return Math.round(value);
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d]/g, "");
    return parseInt(cleaned, 10) || 0;
  }
  return 0;
}

/**
 * Transforms incoming ShopeeFood order payload into RPC-ready items structure
 */
export function transformShopeeOrderPayload(
  shopeeOrder: ShopeeOrderRaw,
  dbItems: Array<{ id: number; name: string; base_price: number }>,
): TransformedOrderForRpc {
  const rawItems =
    shopeeOrder.items || shopeeOrder.dishList || shopeeOrder.orderItems || [];

  const items = rawItems.map((si) => {
    const matched = matchMenuItem(si, dbItems);

    const sides: Array<{ name: string; price: number; quantity: number; side_item_id: number }> = [];
    const unmatchedOptions: string[] = [];

    // Parse options or modifiers (Shopee Partner web structure)
    const optionsList = si.options || si.modifiers || [];
    for (const opt of optionsList) {
      const rawOptId =
        "optionId" in opt && opt.optionId != null
          ? opt.optionId
          : "modifierId" in opt && opt.modifierId != null
          ? opt.modifierId
          : "";
      const optId = rawOptId !== "" ? String(rawOptId) : "";
      const mappedOpt = optId ? SHOPEE_MENU_MAPPING[optId] : null;
      const optName =
        mappedOpt?.name ||
        opt.name ||
        ("groupName" in opt && typeof opt.groupName === "string"
          ? opt.groupName
          : undefined) ||
        "Món thêm";
      const optPrice = parseNumericPrice(opt.price);
      const optQty = typeof opt.quantity === "number" && opt.quantity > 0 ? opt.quantity : 1;

      const matchedSide = matchSideItem(optName, dbItems);
      if (matchedSide) {
        sides.push({
          side_item_id: matchedSide.id,
          name: matchedSide.name,
          price: optPrice > 0 ? optPrice : matchedSide.base_price,
          quantity: optQty,
        });
      } else {
        unmatchedOptions.push(optName);
      }
    }

    const sidesSum = sides.reduce((acc, s) => acc + s.price * s.quantity, 0);
    const rawItemPrice = parseNumericPrice(si.price);
    const unitPrice =
      rawItemPrice > 0 ? rawItemPrice : matched.base_price + sidesSum;
    const qty = si.quantity || 1;
    const subtotal = unitPrice * qty;

    const noteParts = [
      si.note?.trim(),
      unmatchedOptions.length > 0 ? `Tùy chọn: ${unmatchedOptions.join(", ")}` : null,
    ].filter(Boolean);

    return {
      menu_item_id: matched.id,
      item_name: matched.name,
      quantity: qty,
      unit_price: unitPrice,
      modifiers: [],
      sides,
      subtotal,
      note: noteParts.length > 0 ? noteParts.join(" • ") : null,
    };
  });

  // The relay route rejects receipts without an extractable order code before
  // this transform runs, so no synthesized fallback ID is needed here.
  const displayId =
    shopeeOrder.displayId ||
    shopeeOrder.orderCode ||
    (shopeeOrder.orderId ? String(shopeeOrder.orderId) : "");
  const orderId = shopeeOrder.orderId ? String(shopeeOrder.orderId) : displayId;

  const eaterName =
    shopeeOrder.customer?.name ||
    shopeeOrder.buyer?.name ||
    "Khách ShopeeFood";
  const eaterPhone =
    shopeeOrder.customer?.phone || shopeeOrder.buyer?.phone || "";
  const phoneText = eaterPhone ? ` (${eaterPhone})` : "";

  const cutleryFlag = shopeeOrder.needCutlery;
  const cutleryNote =
    cutleryFlag === true || cutleryFlag === 1 || cutleryFlag === 2
      ? " • Lấy muỗng đũa"
      : cutleryFlag === false || cutleryFlag === 0
      ? " • Không lấy dụng cụ"
      : "";

  const extraNote = shopeeOrder.note || shopeeOrder.customer?.note || "";
  const extraNoteText = extraNote ? ` • Note: ${extraNote}` : "";

  const customerNote = `[ShopeeFood ${displayId}] ${eaterName}${phoneText}${cutleryNote}${extraNoteText}`;

  const parsedSubtotal = parseNumericPrice(shopeeOrder.subtotal);
  const parsedTotal = parseNumericPrice(
    shopeeOrder.total || shopeeOrder.totalPrice,
  );
  const calculatedItemsTotal = items.reduce((acc, i) => acc + i.subtotal, 0);

  return {
    orderId,
    idempotencyKey: generateOrderUuid(orderId),
    displayId,
    restaurantId: shopeeOrder.restaurantId
      ? String(shopeeOrder.restaurantId)
      : undefined,
    customerNote,
    paymentMethod: "platform",
    subtotal: parsedSubtotal > 0 ? parsedSubtotal : calculatedItemsTotal,
    totalAmount: parsedTotal > 0 ? parsedTotal : calculatedItemsTotal,
    items,
  };
}
