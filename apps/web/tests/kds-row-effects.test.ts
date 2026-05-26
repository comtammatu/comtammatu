import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  KDS_ROW_EFFECT_MS,
  createKdsRowSnapshot,
  deriveKdsRowEffects,
  getKdsRowEffectClass,
} from "../app/(protected)/br/[branchId]/kds/hooks/use-kds-row-effects";
import type {
  KdsOrderItem,
  KdsTicket,
} from "../app/(protected)/br/[branchId]/kds/types";

const kdsBoardSource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/kds/kds-board.tsx"),
  "utf8",
);

const ticketRowSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/components/ticket-row.tsx",
  ),
  "utf8",
);

const orderGridSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/components/order-grid.tsx",
  ),
  "utf8",
);

const focusViewSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/kds/components/focus-view.tsx",
  ),
  "utf8",
);

function makeTicket(overrides: Partial<KdsTicket> = {}): KdsTicket {
  return {
    id: overrides.id ?? 1,
    station_id: overrides.station_id ?? 1,
    order_id: overrides.order_id ?? 1,
    order_item_id: overrides.order_item_id ?? 10,
    kitchen_send_batch_id: overrides.kitchen_send_batch_id ?? 20,
    status: overrides.status ?? "pending",
    bumped_at: overrides.bumped_at ?? null,
    created_at: overrides.created_at ?? "2026-05-25T01:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-05-25T01:00:00.000Z",
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

function effectFrom(
  previous: ReturnType<typeof createKdsRowSnapshot>,
  next: ReturnType<typeof createKdsRowSnapshot>,
) {
  return deriveKdsRowEffects(new Map([[previous.ticketId, previous]]), [
    next,
  ]).effects.get(next.ticketId);
}

test("KDS row effects prime initial snapshot without flashing rows", () => {
  const initial = createKdsRowSnapshot(makeTicket(), makeItem());
  const { nextSnapshots, effects } = deriveKdsRowEffects(null, [initial]);

  assert.equal(effects.size, 0);
  assert.deepEqual(nextSnapshots.get(initial.ticketId), initial);
});

test("KDS row effects classify added, quantity, content, status, and removal tones", () => {
  const ticket = makeTicket();
  const item = makeItem();
  const previous = createKdsRowSnapshot(ticket, item);

  const addedTicket = makeTicket({ id: 2, order_item_id: 11 });
  const addedItem = makeItem({ id: 11, item_name: "Canh thêm" });
  const addedResult = deriveKdsRowEffects(
    new Map([[previous.ticketId, previous]]),
    [previous, createKdsRowSnapshot(addedTicket, addedItem)],
  );
  assert.equal(addedResult.effects.get(addedTicket.id), "added");

  assert.equal(
    effectFrom(
      previous,
      createKdsRowSnapshot(ticket, makeItem({ quantity: 3 })),
    ),
    "quantity",
  );
  assert.equal(
    effectFrom(
      previous,
      createKdsRowSnapshot(ticket, makeItem({ note: "ít mỡ" })),
    ),
    "content",
  );
  assert.equal(
    effectFrom(
      previous,
      createKdsRowSnapshot(
        ticket,
        makeItem({
          modifiers: [{ modifier_id: 5, name: "Không hành", price: 0 }],
          sides: [
            {
              side_item_id: 7,
              name: "Trứng",
              price: 5_000,
              quantity: 1,
              is_default: false,
            },
          ],
          is_priority: true,
          variant_name: "Đặc biệt",
        }),
      ),
    ),
    "content",
  );
  assert.equal(
    effectFrom(
      previous,
      createKdsRowSnapshot(makeTicket({ status: "preparing" }), item),
    ),
    "status",
  );
  assert.equal(
    effectFrom(
      previous,
      createKdsRowSnapshot(makeTicket({ status: "cancelled" }), item),
    ),
    "removed",
  );
});

test("KDS row effect classes use semantic tokens and motion-safe animation", () => {
  assert.equal(KDS_ROW_EFFECT_MS, 1800);
  assert.match(getKdsRowEffectClass("added") || "", /bg-info\/10/);
  assert.match(
    getKdsRowEffectClass("added") || "",
    /motion-safe:animate-pulse/,
  );
  assert.match(getKdsRowEffectClass("quantity") || "", /bg-warning\/10/);
  assert.match(
    getKdsRowEffectClass("quantity") || "",
    /motion-safe:animate-pulse/,
  );
  assert.match(getKdsRowEffectClass("content") || "", /ring-info\/40/);
  assert.match(getKdsRowEffectClass("status") || "", /ring-success\/40/);
  assert.match(getKdsRowEffectClass("removed") || "", /ring-destructive\/40/);
});

test("KDS row effects are wired across board, comprehensive, focus, and ticket rows", () => {
  assert.match(kdsBoardSource, /useKdsRowEffects\(\{/);
  assert.match(kdsBoardSource, /<KdsRowEffectsProvider value=\{rowEffects\}>/);
  assert.match(ticketRowSource, /useKdsRowEffect\(ticket\?\.id\)/);
  assert.match(ticketRowSource, /data-kds-effect=\{rowEffect \?\? undefined\}/);
  assert.match(orderGridSource, /useKdsRowEffect\(ticket\?\.id\)/);
  assert.match(orderGridSource, /data-kds-effect=\{rowEffect \?\? undefined\}/);
  assert.match(focusViewSource, /useKdsRowEffectsValue\(\)/);
  assert.match(focusViewSource, /data-kds-effect=\{rowEffect \?\? undefined\}/);
  assert.doesNotMatch(focusViewSource, /buildFocusItemKey/);
});
