import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  KDS_ORDER_COLUMN_DEFINITIONS,
  getKdsOrderItemColumnId,
  getKdsOrderLabelOverride,
  getKdsScopedGroupKey,
  groupKdsOrdersByColumn,
} from "../app/(protected)/br/[branchId]/kds/_lib/order-columns";
import { getStatusBadgeMeta } from "../app/components/status-badge";
import { formatKdsElapsedClock } from "../app/(protected)/br/[branchId]/kds/_lib/age-style";
import { formatKdsTicketSequenceDisplay } from "../app/(protected)/br/[branchId]/kds/_lib/status-config";
import type {
  KdsOrder,
  KdsOrderItem,
} from "../app/(protected)/br/[branchId]/kds/types";

const kdsRealtimeSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/_hooks/use-kds-realtime.ts",
  ),
  "utf8",
);

const kdsBoardSource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/kds/kds-board.tsx"),
  "utf8",
);

const kdsLayoutSource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/kds/layout.tsx"),
  "utf8",
);

const kdsLoadingSource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/kds/loading.tsx"),
  "utf8",
);

const kdsErrorSource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/kds/error.tsx"),
  "utf8",
);

const orderGridSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/_components/order-grid.tsx",
  ),
  "utf8",
);

const orderTitleLineSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/_components/order-title-line.tsx",
  ),
  "utf8",
);

const focusViewSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/_components/focus-view.tsx",
  ),
  "utf8",
);

const orderNoteSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/_components/order-note.tsx",
  ),
  "utf8",
);

function makeOrder(
  overrides: Partial<KdsOrder> & Pick<KdsOrder, "groupKey">,
): KdsOrder {
  return {
    groupKey: overrides.groupKey,
    orderId: overrides.orderId ?? 1,
    orderNumber: overrides.orderNumber ?? "TC-20260525-001-PH",
    kitchenTicketNumber: overrides.kitchenTicketNumber ?? "PB-260525-001",
    orderType: overrides.orderType ?? "dine_in",
    tableNumber: overrides.tableNumber ?? null,
    createdAt: overrides.createdAt ?? "2026-05-25T01:00:00.000Z",
    sendSeq: overrides.sendSeq ?? 1,
    sendKind: overrides.sendKind ?? null,
    isPriority: overrides.isPriority ?? false,
    orderNote: overrides.orderNote ?? null,
    tickets: overrides.tickets ?? [],
    items: overrides.items ?? [],
  };
}

function makeItem(overrides: Partial<KdsOrderItem> = {}): KdsOrderItem {
  return {
    id: overrides.id ?? 10,
    order_id: overrides.order_id ?? 1,
    menu_item_id: overrides.menu_item_id ?? 100,
    item_name: overrides.item_name ?? "Cơm sườn",
    category_name: overrides.category_name ?? "Món chính",
    category_type: overrides.category_type ?? "main_dish",
    variant_name: overrides.variant_name ?? null,
    quantity: overrides.quantity ?? 1,
    unit_price: overrides.unit_price ?? 35_000,
    status: overrides.status ?? "pending",
    is_priority: overrides.is_priority ?? false,
    note: overrides.note ?? null,
    modifiers: overrides.modifiers ?? null,
    sides: overrides.sides ?? null,
  };
}

test("KDS title display uses kitchen ticket sequence instead of long order number", () => {
  assert.equal(
    formatKdsTicketSequenceDisplay("PB-260525-055", "TC-20260525-025-PH"),
    "#55",
  );
  assert.equal(formatKdsTicketSequenceDisplay("PB-260525-057"), "#57");
  assert.equal(formatKdsTicketSequenceDisplay("PB-260525-056"), "#56");
  assert.equal(
    formatKdsTicketSequenceDisplay("#105-2", "TC-260525-105-PH"),
    "#105-2",
  );
  assert.equal(
    formatKdsTicketSequenceDisplay("#087", "TC-260525-087-PH"),
    "#087",
  );
});

test("KDS title display falls back to order sequence", () => {
  assert.equal(
    formatKdsTicketSequenceDisplay(
      "KITCHEN-WITHOUT-SEQUENCE",
      "TC-20260525-025-PH",
    ),
    "#25",
  );
});

test("KDS ready status uses the shared Sẵn sàng wording", () => {
  assert.equal(getStatusBadgeMeta("order-item", "ready").label, "Sẵn sàng");
});

test("KDS comprehensive board groups orders into item-category service columns", () => {
  const dineIn = makeOrder({ groupKey: "dine-in", orderType: "dine_in" });
  const takeaway = makeOrder({
    groupKey: "takeaway",
    orderType: "takeaway",
  });
  const appendMainDish = makeOrder({
    groupKey: "append-main-dish",
    orderType: "dine_in",
    sendKind: "append",
    items: [makeItem()],
  });
  const addOn = makeOrder({
    groupKey: "add-on",
    orderType: "takeaway",
    items: [
      makeItem({
        item_name: "Thêm trứng",
        category_name: "Thêm",
        category_type: "side_dish",
      }),
    ],
  });

  const columns = groupKdsOrdersByColumn([
    dineIn,
    takeaway,
    appendMainDish,
    addOn,
  ]);

  assert.deepEqual(
    KDS_ORDER_COLUMN_DEFINITIONS.map((column) => [
      column.id,
      column.title,
      column.widthClass,
    ]),
    [
      ["dine_in", "Tại bàn", "xl:col-span-3"],
      ["takeaway", "Mang về", "xl:col-span-3"],
      ["add_on", "Món thêm", "xl:col-span-2"],
    ],
  );
  assert.deepEqual(
    columns.map((column) => [
      column.id,
      column.orders.map((order) => order.groupKey),
    ]),
    [
      ["dine_in", ["dine-in", "append-main-dish"]],
      ["takeaway", ["takeaway"]],
      ["add_on", ["add-on"]],
    ],
  );
});

test("KDS món thêm lane requires category Thêm and type Món phụ", () => {
  assert.equal(
    getKdsOrderItemColumnId(
      makeItem({ category_name: "Thêm", category_type: "side_dish" }),
      "takeaway",
    ),
    "add_on",
  );
  assert.equal(
    getKdsOrderItemColumnId(
      makeItem({ category_name: "Thêm", category_type: "main_dish" }),
      "dine_in",
    ),
    "dine_in",
  );
  assert.equal(
    getKdsOrderItemColumnId(
      makeItem({ category_name: "Món phụ", category_type: "side_dish" }),
      "takeaway",
    ),
    "takeaway",
  );
});

test("KDS title keeps table target and ticket code without append labels", () => {
  const addOnDineIn = makeOrder({
    groupKey: "add-on-dine-in",
    orderType: "dine_in",
    tableNumber: 12,
    items: [
      makeItem({
        item_name: "Thêm trứng",
        category_name: "Thêm",
        category_type: "side_dish",
      }),
    ],
  });
  const appendMainDish = makeOrder({
    groupKey: "append-main-dish",
    orderType: "dine_in",
    tableNumber: 12,
    sendKind: "append",
    items: [makeItem()],
  });

  assert.equal(getKdsOrderLabelOverride(addOnDineIn), undefined);
  assert.equal(getKdsOrderLabelOverride(appendMainDish), undefined);
  assert.match(
    orderTitleLineSource,
    /const callTarget = getCallTarget\(orderType, tableNumber\);/,
  );
  assert.doesNotMatch(orderTitleLineSource, /contextLabel/);
  assert.doesNotMatch(orderTitleLineSource, /Gọi thêm/);
  assert.doesNotMatch(orderTitleLineSource, /title=/);
  assert.doesNotMatch(orderTitleLineSource, /truncate|line-clamp/);
  assert.doesNotMatch(orderNoteSource, /truncate|line-clamp|overflow-hidden/);
  assert.doesNotMatch(orderGridSource, /contextLabel=/);
  assert.doesNotMatch(focusViewSource, /contextLabel=/);
  assert.doesNotMatch(orderGridSource, /Gọi thêm/);
  assert.doesNotMatch(focusViewSource, /Gọi thêm/);
});

test("KDS mixed kitchen batch can split normal items from món thêm", () => {
  const baseGroupKey = "batch-42";

  assert.equal(
    getKdsScopedGroupKey(
      baseGroupKey,
      getKdsOrderItemColumnId(
        makeItem({ category_name: "Món chính", category_type: "main_dish" }),
        "dine_in",
      ),
    ),
    "batch-42",
  );
  assert.equal(
    getKdsScopedGroupKey(
      baseGroupKey,
      getKdsOrderItemColumnId(
        makeItem({ category_name: "Thêm", category_type: "side_dish" }),
        "dine_in",
      ),
    ),
    "batch-42:add_on",
  );
});

test("KDS keeps order note separate from item note", () => {
  const order = makeOrder({
    groupKey: "notes",
    orderNote: "KH dị ứng hành",
    items: [makeItem({ note: "ít mỡ" })],
  });

  assert.equal(order.orderNote, "KH dị ứng hành");
  assert.equal(order.items[0]?.note, "ít mỡ");
});

test("KDS selects and renders order notes in board and focus modes", () => {
  // The page streams the shell; order/item select strings live in the realtime
  // hook that fetches the ticket snapshot.
  assert.match(kdsRealtimeSource, /order_type, table_id, is_priority, note,/);
  assert.match(kdsRealtimeSource, /order_type, table_id, note,/);
  assert.match(kdsRealtimeSource, /menu_items\(menu_categories\(name,type\)\)/);
  assert.match(kdsRealtimeSource, /oldRow\.note === newRow\.note/);
  assert.match(orderGridSource, /<OrderNote[\s\S]*note=\{order\.orderNote\}/);
  assert.match(focusViewSource, /<OrderNote[\s\S]*note=\{order\.orderNote\}/);
  assert.match(orderNoteSource, /messages\.pos\.kds\.orderNote/);
  assert.match(orderNoteSource, /note\?\.trim\(\)/);
});

test("KDS fullscreen keeps body-level portals inside the fullscreen tree", () => {
  assert.match(
    kdsBoardSource,
    /document\.fullscreenElement === document\.documentElement/,
  );
  assert.match(kdsBoardSource, /fullscreenTarget = document\.documentElement/);
  assert.match(kdsBoardSource, /fullscreenTarget\.requestFullscreen\(\)/);
  assert.doesNotMatch(kdsBoardSource, /root\.requestFullscreen\(\)/);
});

test("KDS layout owns the viewport while board states fill the remaining workspace", () => {
  assert.match(kdsLayoutSource, /<main[\s\S]*?className="[^"]*h-dvh[^"]*"/);
  assert.match(
    kdsBoardSource,
    /className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background font-sans"/,
  );
  assert.doesNotMatch(kdsBoardSource, /\bh-dvh\b/);
  assert.match(
    kdsLoadingSource,
    /className="flex min-h-0 flex-1 items-center justify-center"/,
  );
  assert.match(
    kdsErrorSource,
    /className="flex min-h-0 flex-1 items-center justify-center p-4"/,
  );
});

test("KDS elapsed clock is a static mm:ss label", () => {
  assert.equal(formatKdsElapsedClock(0), "00:00");
  assert.equal(formatKdsElapsedClock(3 * 60_000 + 20_000), "03:20");
  assert.equal(formatKdsElapsedClock(7 * 60_000 + 15_000), "07:15");
  assert.equal(formatKdsElapsedClock(12 * 60_000 + 40_000), "12:40");
});

test("KDS focus view advances immediately without blur or pulse", () => {
  assert.match(focusViewSource, /const ADVANCE_DELAY_MS = 0;/);
  assert.doesNotMatch(focusViewSource, /backdrop-blur-sm/);
  assert.doesNotMatch(focusViewSource, /animate-pulse/);
  assert.doesNotMatch(focusViewSource, /transition-colors duration-150/);
});
