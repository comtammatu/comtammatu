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
  "SPF_ITEM_COM_THEM": { name: "Cơm Thêm", defaultPrice: 6000, category: "Món khác" },

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
  "SPF_MOD_COM_THEM": { name: "Cơm Thêm", defaultPrice: 6000 },
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

const ITEM_NAME_ALIASES: Record<string, string> = {
  "com suon cot let": "Sườn Cốt Lết",
  "com suon cong": "Sườn Cọng",
  "com suon mot gang": "Sườn Một Gang",
  "com them": "Cơm Thêm",
};

const STANDALONE_OPTION_ALIASES: Record<string, string> = {
  "canh kho qua": "Canh Khổ Qua",
  "canh chua tom": "Canh Chua Tôm",
};

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
  customerNote: string | null;
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
    discount_type?: "pct" | "vnd" | null;
    discount_value?: number | null;
    discount_note?: string | null;
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
  const targetName =
    mapped?.name ||
    ITEM_NAME_ALIASES[normalizeMenuName(shopeeItem.name)] ||
    shopeeItem.name;
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

  throw new Error(
    `Món "${shopeeItem.name}" (ID: ${idStr || "N/A"}) chưa được ánh xạ trong thực đơn quán`,
  );
}

const SIDE_NAME_ALIASES: Record<string, string> = {
  "hop, muong, nia": "Dụng Cụ Mang Về",
  "hop muong nia": "Dụng Cụ Mang Về",
  "dung cu an uong": "Dụng Cụ Mang Về",
  "dung cu mang ve": "Dụng Cụ Mang Về",
  "muong dua": "Dụng Cụ Mang Về",
  "top mo": "Tóp Mỡ",
  "mo hanh": "Mỡ Hành",
  "com them": "Cơm Thêm",
  "them com": "Cơm Thêm",
  "phan com them": "Cơm Thêm",
  "com trang them": "Cơm Thêm",
  "com tam them": "Cơm Thêm",
  "com": "Cơm Thêm",
  "extra rice": "Cơm Thêm",
  "trung": "Trứng",
  "trung op la": "Trứng",
  "trung chien": "Trứng",
  "cha": "Chả",
  "cha trung": "Chả",
  "bi": "Bì",
  "bi heo": "Bì",
  "suon them": "Sườn Cốt Lết",
  "them suon": "Sườn Cốt Lết",
};

/**
 * Detects if a note contains delivery driver (shipper) instructions
 * rather than restaurant kitchen / food preparation requests.
 */
export function isShipperInstruction(note: string): boolean {
  if (!note || !note.trim()) return false;
  const normalized = normalizeMenuName(note);

  const shipperPatterns = [
    /\b(?:giao|ship)\s+(?:tan|len|xuong|cho|o|tai|lau|tang|phong|sanh|cong|nha|hem|ngo|chung\s*cu|toa\s*nha|can\s*ho|bao\s*ve|le\s*tan)\b/,
    /\b(?:giao|ship)\s+(?:den|toi|truoc|sau|dung\s*gio|nhanh)\b/,
    /\b(?:goi|alo|call|lien\s*he|nhan\s*tin)\s+(?:truoc|khi|so|e|em|minh|cho|toi|den|khach)\b/,
    /\b(?:de|treo|dat|gui)\s+(?:o|truoc|ngoai|cua|cong|xe|ban|hang\s*rao|bao\s*ve|le\s*tan)\b/,
    /\b(?:bam\s*chuong|go\s*cua|hem\s*sau|den\s*noi|toi\s*noi|dung\s*dia\s*chi|sanh\s*[a-z0-9])\b/,
    /\b(?:shipper|tai\s*xe|anh\s*ship|bac\s*tai|tai\s*xe\s*giao)\b/,
    /\b(?:lay\s*hang\s*tai|gap\s*bao\s*ve|len\s*lau|len\s*tang)\b/,
  ];

  return shipperPatterns.some((pattern) => pattern.test(normalized));
}

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

  // 1. Exact match against alias or normalized target
  const exact = dbItems.find((dbi) => {
    const dbiNorm = normalizeMenuName(dbi.name);
    return (
      dbiNorm === target ||
      dbiNorm === normalizedTarget ||
      dbi.name.toLowerCase() === target ||
      dbi.name.toLowerCase() === normalizedTarget
    );
  });
  if (exact) return exact;

  // 2. Substring match (either DB item contains target/normalizedTarget or vice versa)
  return (
    dbItems.find((d) => {
      const norm = normalizeMenuName(d.name);
      return (
        norm.includes(target) ||
        target.includes(norm) ||
        norm.includes(normalizedTarget) ||
        normalizedTarget.includes(norm)
      );
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

function matchStandaloneOptionItem(
  optionName: string,
  dbItems: Array<{ id: number; name: string; base_price: number }>,
): { id: number; name: string; base_price: number } | null {
  const canonicalName = STANDALONE_OPTION_ALIASES[normalizeMenuName(optionName)];
  if (!canonicalName) return null;
  const normalizedCanonical = normalizeMenuName(canonicalName);
  return (
    dbItems.find(
      (item) => normalizeMenuName(item.name) === normalizedCanonical,
    ) ?? null
  );
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

  const items = rawItems.flatMap((si): TransformedOrderForRpc["items"] => {
    const matched = matchMenuItem(si, dbItems);
    const qty = si.quantity || 1;

    const sides: Array<{ name: string; price: number; quantity: number; side_item_id: number }> = [];
    const optionNotes: string[] = [];
    const standaloneOptions: Array<{
      item: { id: number; name: string; base_price: number };
      price: number;
      quantity: number;
    }> = [];

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
      const optQty = typeof opt.quantity === "number" && opt.quantity > 0 ? opt.quantity : 1;

      const standaloneItem = matchStandaloneOptionItem(optName, dbItems);
      if (standaloneItem) {
        standaloneOptions.push({
          item: standaloneItem,
          price: standaloneItem.base_price,
          quantity: optQty,
        });
        optionNotes.push(standaloneItem.name);
        continue;
      }

      const matchedSide = matchSideItem(optName, dbItems);
      if (matchedSide) {
        sides.push({
          side_item_id: matchedSide.id,
          name: matchedSide.name,
          price: matchedSide.base_price,
          quantity: optQty,
        });
      } else {
        optionNotes.push(optName);
      }
    }

    const sidesSum = sides.reduce((acc, s) => acc + s.price * s.quantity, 0);
    const rawItemPrice = parseNumericPrice(si.price);
    // OCR prices are diagnostic evidence only. Item identity and the local
    // catalog determine this preview value; create_order independently resolves
    // the authoritative delivery-channel price from the database.
    const unitPrice = matched.base_price + sidesSum;
    const subtotal = unitPrice * qty;

    const isFreeGift =
      (si.price !== undefined && rawItemPrice === 0) ||
      /tặng|quà\s*tặng|free\b|0đ|0\s*đ/i.test(si.name);

    let discountType: "pct" | "vnd" | undefined;
    let discountValue: number | undefined;
    let discountNote: string | undefined;

    if (isFreeGift) {
      discountType = "pct";
      discountValue = 100;
      discountNote = "Khuyến mãi tặng kèm ShopeeFood (0đ)";
    }

    const noteParts = [
      si.note?.trim(),
      optionNotes.length > 0 ? `Tùy chọn: ${optionNotes.join(", ")}` : null,
    ].filter(Boolean);

    const mainItem: TransformedOrderForRpc["items"][number] = {
      menu_item_id: matched.id,
      item_name: matched.name,
      quantity: qty,
      unit_price: unitPrice,
      modifiers: [],
      sides,
      subtotal,
      note: noteParts.length > 0 ? noteParts.join(" • ") : null,
      discount_type: discountType,
      discount_value: discountValue,
      discount_note: discountNote,
    };

    const promotedItems = standaloneOptions.map(
      ({ item, price, quantity }): TransformedOrderForRpc["items"][number] => {
        const promotedQuantity = qty * quantity;
        return {
          menu_item_id: item.id,
          item_name: item.name,
          quantity: promotedQuantity,
          unit_price: price,
          modifiers: [],
          sides: [],
          subtotal: price * promotedQuantity,
          note: null,
        };
      },
    );

    return [mainItem, ...promotedItems];
  });

  // The relay route rejects receipts without an extractable order code before
  // this transform runs, so no synthesized fallback ID is needed here.
  const displayId =
    shopeeOrder.displayId ||
    shopeeOrder.orderCode ||
    (shopeeOrder.orderId ? String(shopeeOrder.orderId) : "");
  const orderId = shopeeOrder.orderId ? String(shopeeOrder.orderId) : displayId;

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
    customerNote: null,
    paymentMethod: "platform",
    subtotal: parsedSubtotal > 0 ? parsedSubtotal : calculatedItemsTotal,
    totalAmount: parsedTotal > 0 ? parsedTotal : calculatedItemsTotal,
    items,
  };
}
