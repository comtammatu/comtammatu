# QR Self-Order V2 — Phase 1: Customer Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the customer QR ordering page so customers always know their session state, can reach submit in one tap, see already-ordered items, and cannot submit a second batch while the first is pending approval.

**Architecture:** V2 is a UI/UX layer over V1. One additive SQL change extends `self_order_get_snapshot` to return `order.items[]`. The 1058-line `self-order-client.tsx` is split into a `self-order/` folder. Layout uses a status pill + FAB cart (option B) on mobile, a pinned total+CTA aside on desktop, all via existing `@comtammatu/ui` primitives.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, Tailwind 4, supabase-js, plpgsql (SECURITY DEFINER RPC), `node:test` static-source tests.

**Spec:** `docs/superpowers/specs/2026-07-08-qr-self-order-v2-design.md` (Phase 1 section).

**Repo commands:** `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm build`, `corepack pnpm test`, `corepack pnpm db:types`, `codegraph index .`.

---

## File Structure

Files created/modified by this plan. Each file has one responsibility.

**Create (snapshot RPC migration + types):**
- `supabase/migrations/20260708140000_self_order_snapshot_order_items.sql` — additive: snapshot returns `order.items[]`.
- (types) extend `apps/web/lib/self-order/contracts.ts` — add `SelfOrderOrderLine` + `order.items`.

**Create (folder split of `self-order-client.tsx`):**
- `apps/web/app/q/[token]/self-order/status-pill.tsx` — session status pill (fix A).
- `apps/web/app/q/[token]/self-order/order-summary.tsx` — "Món đã gọi" collapsed list (fix E).
- `apps/web/app/q/[token]/self-order/menu-panel.tsx` — search + tabs + menu grid (extracted).
- `apps/web/app/q/[token]/self-order/cart-sheet.tsx` — FAB cart + bottom sheet + sticky CTA (fix B).
- `apps/web/app/q/[token]/self-order/payment-panel.tsx` — payment + buyer (extracted).
- `apps/web/app/q/[token]/self-order/hooks.ts` — `useSnapshotSync` (refresh + realtime + poll).

**Modify:**
- `apps/web/app/q/[token]/self-order-client.tsx` — becomes orchestrator importing the folder modules; adds CTA-state logic (fix I).
- `apps/web/app/q/[token]/page.tsx` — branch on `pos_session_closed` code (P3 does this fully; P1 only if quick — see Task 9 note).
- `packages/shared/src/messages/self-order.ts` — add new keys only.

**Test:**
- `apps/web/tests/qr-self-order-v2-phase1.test.ts` — static-source assertions for migration, types, message keys, status-pill, CTA-lock.

**Critical existing test to keep green:** `apps/web/tests/qr-code-image-static.test.ts` asserts `self-order-client.tsx` imports `QrCodeImage` from `@/components/qr-code-image` and renders `<QrCodeImage value={vietQr.qrData}>`. The folder split MUST preserve this import+usage in `self-order-client.tsx` (the payment panel module renders it, and `self-order-client.tsx` must still re-export or pass it). Safest approach: keep `QrCodeImage` rendering in `payment-panel.tsx` and have `self-order-client.tsx` import `PaymentPanel`. The static test reads `self-order-client.tsx` text — so `self-order-client.tsx` must still contain the literal `import { QrCodeImage } from "@/components/qr-code-image"` OR we update the test. We will **update the test** to assert against `payment-panel.tsx` instead, since the rendering genuinely moved. Task 7 covers this.

---

## Task 1: Additive snapshot migration returning `order.items[]`

**Files:**
- Create: `supabase/migrations/20260708140000_self_order_snapshot_order_items.sql`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/qr-self-order-v2-phase1.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

test("snapshot migration returns order.items array", () => {
  const migration = readRepo(
    "supabase/migrations/20260708140000_self_order_snapshot_order_items.sql",
  );

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.self_order_get_snapshot\(p_token text\)/);
  assert.match(migration, /v_order_items jsonb := NULL/);
  assert.match(migration, /jsonb_agg\([\s\S]*ORDER BY oi\.id\)/);
  assert.match(migration, /oi\.status <> 'cancelled'/);
  assert.match(migration, /'items', v_order_items/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.self_order_get_snapshot\(text\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT ALL ON FUNCTION public\.self_order_get_snapshot\(text\) TO service_role/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && corepack pnpm test`
Expected: FAIL — migration file does not exist yet (readFileSync throws).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260708140000_self_order_snapshot_order_items.sql`. This re-declares the full current function (from `20260708125500`) and adds the `v_order_items` variable + SELECT + `'items'` key. Copy the current function body exactly, then add the items block.

```sql
CREATE OR REPLACE FUNCTION public.self_order_get_snapshot(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table record;
  v_session record;
  v_order record;
  v_payment_request record;
  v_session_payload jsonb := NULL;
  v_order_payload jsonb := NULL;
  v_order_items jsonb := NULL;
  v_payment_request_payload jsonb := NULL;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  SELECT
    t.id AS table_id,
    t.tenant_id,
    t.branch_id,
    t.number AS table_number,
    t.self_order_token,
    b.name AS branch_name
  INTO v_table
  FROM public.tables t
  JOIN public.branches b
    ON b.id = t.branch_id
   AND b.tenant_id = t.tenant_id
   AND b.is_active = true
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
    AND t.status <> 'maintenance'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_disabled_token');
  END IF;

  IF NOT public.self_order_branch_has_open_pos_session(v_table.tenant_id, v_table.branch_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'pos_session_closed');
  END IF;

  SELECT *
  INTO v_session
  FROM public.self_order_sessions s
  WHERE s.tenant_id = v_table.tenant_id
    AND s.table_id = v_table.table_id
    AND s.status IN ('pending_approval', 'active')
  ORDER BY s.id DESC
  LIMIT 1;

  IF FOUND THEN
    v_session_payload := jsonb_build_object(
      'status', v_session.status,
      'createdAt', v_session.created_at,
      'approvedAt', v_session.approved_at
    );

    IF v_session.status = 'active' AND v_session.order_id IS NOT NULL THEN
      SELECT
        o.order_number,
        o.status,
        o.payment_status,
        o.payment_method,
        o.total_amount,
        COALESCE(SUM(oi.quantity) FILTER (WHERE oi.status <> 'cancelled'), 0)::int AS item_count
      INTO v_order
      FROM public.orders o
      LEFT JOIN public.order_items oi
        ON oi.order_id = o.id
       AND oi.tenant_id = o.tenant_id
      WHERE o.id = v_session.order_id
        AND o.tenant_id = v_session.tenant_id
      GROUP BY o.id;

      IF FOUND THEN
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'menuItemId', oi.menu_item_id,
              'itemName', oi.item_name,
              'variantId', oi.variant_id,
              'variantName', oi.variant_name,
              'quantity', oi.quantity,
              'unitPrice', oi.unit_price,
              'lineTotal', oi.subtotal,
              'note', oi.note
            )
            ORDER BY oi.id
          ),
          '[]'::jsonb
        )
        INTO v_order_items
        FROM public.order_items oi
        WHERE oi.order_id = v_session.order_id
          AND oi.tenant_id = v_session.tenant_id
          AND oi.status <> 'cancelled';

        v_order_payload := jsonb_build_object(
          'orderNumber', v_order.order_number,
          'status', v_order.status,
          'paymentStatus', v_order.payment_status,
          'paymentMethod', v_order.payment_method,
          'totalAmount', v_order.total_amount,
          'itemCount', v_order.item_count,
          'items', v_order_items
        );
      END IF;

      SELECT status, method, amount_snapshot, created_at
      INTO v_payment_request
      FROM public.self_order_payment_requests pr
      WHERE pr.tenant_id = v_session.tenant_id
        AND pr.session_id = v_session.id
        AND pr.status IN ('cash_call', 'vietqr_pending')
      ORDER BY pr.id DESC
      LIMIT 1;

      IF FOUND THEN
        v_payment_request_payload := jsonb_build_object(
          'status', v_payment_request.status,
          'method', v_payment_request.method,
          'amount', v_payment_request.amount_snapshot,
          'createdAt', v_payment_request.created_at
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'branch', jsonb_build_object(
      'name', v_table.branch_name
    ),
    'table', jsonb_build_object(
      'number', v_table.table_number
    ),
    'session', v_session_payload,
    'order', v_order_payload,
    'paymentRequest', v_payment_request_payload,
    'menu', public.self_order_menu_payload(v_table.tenant_id),
    'realtimeTopic', 'self-order:' || v_table.self_order_token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_get_snapshot(text) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.self_order_get_snapshot(text) TO service_role;
```

Note: the migration file name `20260708140000` is lexically greater than the latest existing migration `20260708130000_fix_inventory_unitless_rpcs.sql`, satisfying the ordering requirement.

- [ ] **Step 4: Run the static test to verify it passes**

Run: `cd apps/web && corepack pnpm test`
Expected: PASS for the new test. (Other existing tests should still pass.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260708140000_self_order_snapshot_order_items.sql apps/web/tests/qr-self-order-v2-phase1.test.ts
git commit -m "feat(self-order): snapshot RPC returns order items array"
```

---

## Task 2: Extend TypeScript snapshot type with `order.items`

**Files:**
- Modify: `apps/web/lib/self-order/contracts.ts:142-149` (the `order?` block inside `PublicSelfOrderSnapshot`)

- [ ] **Step 1: Add the failing test assertion**

Append to `apps/web/tests/qr-self-order-v2-phase1.test.ts` (inside the file, after the existing test):

```ts
test("snapshot contract type includes order.items line type", () => {
  const contracts = readWeb("lib/self-order/contracts.ts");

  assert.match(contracts, /export interface SelfOrderOrderLine \{/);
  assert.match(contracts, /menuItemId: number;/);
  assert.match(contracts, /itemName: string;/);
  assert.match(contracts, /variantName: string \| null;/);
  assert.match(contracts, /quantity: number;/);
  assert.match(contracts, /unitPrice: number;/);
  assert.match(contracts, /lineTotal: number;/);
  assert.match(contracts, /note: string \| null;/);
  assert.match(contracts, /items: SelfOrderOrderLine\[\];/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && corepack pnpm test`
Expected: FAIL — `SelfOrderOrderLine` not found.

- [ ] **Step 3: Add the type**

In `apps/web/lib/self-order/contracts.ts`, add the interface just before `PublicSelfOrderSnapshot` (around line 130), and add `items` to the `order` block.

Add this interface above `PublicSelfOrderSnapshot`:

```ts
export interface SelfOrderOrderLine {
  menuItemId: number;
  itemName: string;
  variantId: number | null;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  note: string | null;
}
```

Then in the `order?` block of `PublicSelfOrderSnapshot`, add `items` as the last field:

```ts
  order?: {
    orderNumber: string;
    status: string;
    paymentStatus: string | null;
    paymentMethod: string | null;
    totalAmount: number;
    itemCount: number;
    items: SelfOrderOrderLine[];
  } | null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && corepack pnpm test`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `corepack pnpm typecheck`
Expected: PASS (no consumers break — `order.items` is additive; existing readers only access scalar fields).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/self-order/contracts.ts apps/web/tests/qr-self-order-v2-phase1.test.ts
git commit -m "feat(self-order): add SelfOrderOrderLine type to snapshot contract"
```

---

## Task 3: Add new SELF_ORDER_VI message keys

**Files:**
- Modify: `packages/shared/src/messages/self-order.ts` (add keys before the closing `} as const` at line 81)

- [ ] **Step 1: Add the failing test**

Append to `apps/web/tests/qr-self-order-v2-phase1.test.ts`:

```ts
test("SELF_ORDER_VI has v2 phase1 status and CTA keys", () => {
  const messages = readRepo("packages/shared/src/messages/self-order.ts");

  assert.match(messages, /statusPendingApproval:/);
  assert.match(messages, /statusActive:/);
  assert.match(messages, /statusAwaitingVietQr:/);
  assert.match(messages, /statusAwaitingCash:/);
  assert.match(messages, /statusClosed:/);
  assert.match(messages, /ctaAwaitingApproval:/);
  assert.match(messages, /ctaAwaitingApprovalHint:/);
  assert.match(messages, /orderedItemsTitle:/);
  assert.match(messages, /orderedItemsShowMore:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && corepack pnpm test`
Expected: FAIL — keys missing.

- [ ] **Step 3: Add the keys**

In `packages/shared/src/messages/self-order.ts`, insert these keys just before the closing `} as const;` (currently line 81). Do NOT edit any existing key.

```ts
  statusPendingApproval: "Đang chờ nhân viên duyệt",
  statusActive: "Đang gọi món",
  statusAwaitingVietQr: "Đang chờ thanh toán QR",
  statusAwaitingCash: "Đang chờ nhân viên thu tiền",
  statusClosed: "Đã thanh toán",
  ctaAwaitingApproval: "Đang chờ duyệt lô đầu",
  ctaAwaitingApprovalHint:
    "Nhân viên đang kiểm tra lô gọi món đầu tiên. Vui lòng đợi duyệt xong để gọi thêm.",
  orderedItemsTitle: "Món đã gọi",
  orderedItemsShowMore: "Xem thêm",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && corepack pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/messages/self-order.ts apps/web/tests/qr-self-order-v2-phase1.test.ts
git commit -m "feat(self-order): add v2 customer status and CTA message keys"
```

---

## Task 4: Extract `useSnapshotSync` hook

**Files:**
- Create: `apps/web/app/q/[token]/self-order/hooks.ts`

This task extracts the realtime + poll logic from `self-order-client.tsx` so the orchestrator stays lean. No behavior change.

- [ ] **Step 1: Create the hook file**

Create `apps/web/app/q/[token]/self-order/hooks.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@comtammatu/database/supabase/client";
import type { PublicSelfOrderSnapshot } from "@lib/self-order/contracts";

async function readApiResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & { ok?: boolean })
    | null;
  if (response.ok && payload?.ok !== false) return { ok: true, payload } as const;

  return {
    ok: false,
    error: {
      ok: false as const,
      code: typeof payload?.code === "string" ? payload.code : undefined,
      message: typeof payload?.message === "string" ? payload.message : undefined,
    },
  } as const;
}

export function useSnapshotSync(
  token: string,
  initialSnapshot: PublicSelfOrderSnapshot,
) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  const refreshSnapshot = useCallback(async () => {
    const response = await fetch(`/api/self-order/${encodeURIComponent(token)}`, {
      method: "GET",
      cache: "no-store",
    });
    const result = await readApiResponse(response);
    if (result.ok && result.payload) {
      setSnapshot(result.payload as unknown as PublicSelfOrderSnapshot);
    }
  }, [token]);

  useEffect(() => {
    if (!snapshot.realtimeTopic) return;
    const supabase = createClient();
    const channel = supabase
      .channel(snapshot.realtimeTopic)
      .on("broadcast", { event: "session_changed" }, () => {
        void refreshSnapshot();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshSnapshot, snapshot.realtimeTopic]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshSnapshot();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refreshSnapshot]);

  return { snapshot, setSnapshot, refreshSnapshot };
}
```

- [ ] **Step 2: Typecheck**

Run: `corepack pnpm typecheck`
Expected: PASS (file is created but not yet imported; that's fine).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/q/[token]/self-order/hooks.ts
git commit -m "refactor(self-order): extract useSnapshotSync hook"
```

---

## Task 5: Build the status pill component

**Files:**
- Create: `apps/web/app/q/[token]/self-order/status-pill.tsx`

This implements fix A (clear session-state visual). It replaces the old `SessionStatus` NoteCallout.

- [ ] **Step 1: Add the failing test**

Append to `apps/web/tests/qr-self-order-v2-phase1.test.ts`:

```ts
test("status-pill renders mapped SELF_ORDER_VI labels by session state", () => {
  const pill = readWeb("app/q/[token]/self-order/status-pill.tsx");

  assert.match(pill, /import \{ Badge \} from "@comtammatu\/ui\/components\/badge"/);
  assert.match(pill, /SELF_ORDER_VI\.statusPendingApproval/);
  assert.match(pill, /SELF_ORDER_VI\.statusActive/);
  assert.match(pill, /SELF_ORDER_VI\.statusAwaitingVietQr/);
  assert.match(pill, /SELF_ORDER_VI\.statusAwaitingCash/);
  assert.match(pill, /SELF_ORDER_VI\.statusClosed/);
  assert.match(pill, /variant: "warning"/);
  assert.match(pill, /variant: "success"/);
  assert.match(pill, /variant: "info"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && corepack pnpm test`
Expected: FAIL — file not found.

- [ ] **Step 3: Write the component**

Create `apps/web/app/q/[token]/self-order/status-pill.tsx`:

```tsx
"use client";

import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import type { PublicSelfOrderSnapshot } from "@lib/self-order/contracts";

interface StatusPillProps {
  session: PublicSelfOrderSnapshot["session"];
  paymentRequest: PublicSelfOrderSnapshot["paymentRequest"];
  order: PublicSelfOrderSnapshot["order"];
}

interface PillConfig {
  label: string;
  variant: BadgeProps["variant"];
}

function resolvePillConfig({
  session,
  paymentRequest,
  order,
}: StatusPillProps): PillConfig | null {
  const status = session?.status;
  if (!status) return null;

  if (status === "pending_approval") {
    return { label: SELF_ORDER_VI.statusPendingApproval, variant: "warning" };
  }
  if (status !== "active") {
    if (status === "closed") {
      return { label: SELF_ORDER_VI.statusClosed, variant: "secondary" };
    }
    return null;
  }

  if (paymentRequest?.status === "vietqr_pending") {
    return { label: SELF_ORDER_VI.statusAwaitingVietQr, variant: "info" };
  }
  if (paymentRequest?.status === "cash_call") {
    return { label: SELF_ORDER_VI.statusAwaitingCash, variant: "warning" };
  }

  const paid = order && (order.paymentStatus === "paid" || status === "closed");
  if (paid) {
    return { label: SELF_ORDER_VI.statusClosed, variant: "secondary" };
  }

  return { label: SELF_ORDER_VI.statusActive, variant: "success" };
}

export function StatusPill(props: StatusPillProps) {
  const config = resolvePillConfig(props);
  if (!config) return null;

  return (
    <Badge variant={config.variant} className="gap-1">
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {config.label}
    </Badge>
  );
}
```

Note: `Badge` is exported from `@comtammatu/ui/components/badge` (used elsewhere in the existing client). `BadgeProps["variant"]` includes `secondary`/`warning`/`success`/`info` (confirmed from the approval sheet usage of `variant="warning"`, `variant="info"`, `variant="success"`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && corepack pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/q/[token]/self-order/status-pill.tsx apps/web/tests/qr-self-order-v2-phase1.test.ts
git commit -m "feat(self-order): add session status pill component"
```

---

## Task 6: Build the "Món đã gọi" order summary component

**Files:**
- Create: `apps/web/app/q/[token]/self-order/order-summary.tsx`

Implements fix E — shows already-ordered line items, collapsed when > 5.

- [ ] **Step 1: Add the failing test**

Append to `apps/web/tests/qr-self-order-v2-phase1.test.ts`:

```ts
test("order-summary lists SelfOrderOrderLine items with collapse at 5", () => {
  const summary = readWeb("app/q/[token]/self-order/order-summary.tsx");

  assert.match(summary, /import type \{ SelfOrderOrderLine \} from "@lib\/self-order\/contracts"/);
  assert.match(summary, /SELF_ORDER_VI\.orderedItemsTitle/);
  assert.match(summary, /SELF_ORDER_VI\.orderedItemsShowMore/);
  assert.match(summary, /useState<boolean>/);
  assert.match(summary, /items\.slice\(0, 5\)/);
  assert.match(summary, /formatVND/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && corepack pnpm test`
Expected: FAIL — file not found.

- [ ] **Step 3: Write the component**

Create `apps/web/app/q/[token]/self-order/order-summary.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ChevronDown as IconChevronDown, ChevronUp as IconChevronUp } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@comtammatu/ui/components/item";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import type { SelfOrderOrderLine } from "@lib/self-order/contracts";

const COLLAPSE_THRESHOLD = 5;

interface OrderSummaryProps {
  items: SelfOrderOrderLine[];
}

export function OrderSummary({ items }: OrderSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, COLLAPSE_THRESHOLD);
  const hasMore = items.length > COLLAPSE_THRESHOLD;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-sm font-semibold">
          {SELF_ORDER_VI.orderedItemsTitle}
        </h2>
        <Badge variant="outline">{items.length}</Badge>
      </div>
      <Item variant="outline" className="flex-col gap-1 p-2">
        {visible.map((item, index) => (
          <ItemContent key={`${item.menuItemId}:${index}`} className="flex-row items-center justify-between gap-3">
            <ItemTitle className="min-w-0 truncate text-sm font-normal">
              {item.variantName ? `${item.itemName} ${item.variantName}` : item.itemName}
              <span className="ml-1 text-muted-foreground">x{item.quantity}</span>
            </ItemTitle>
            <ItemDescription className="shrink-0 tabular-nums">
              {formatVND(item.lineTotal)}
            </ItemDescription>
          </ItemContent>
        ))}
        {hasMore ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? <IconChevronUp data-icon="inline-start" /> : <IconChevronDown data-icon="inline-start" />}
            {SELF_ORDER_VI.orderedItemsShowMore}
          </Button>
        ) : null}
      </Item>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && corepack pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/q/[token]/self-order/order-summary.tsx apps/web/tests/qr-self-order-v2-phase1.test.ts
git commit -m "feat(self-order): add already-ordered items summary"
```

---

## Task 7: Extract payment panel (preserves QrCodeImage usage)

**Files:**
- Create: `apps/web/app/q/[token]/self-order/payment-panel.tsx`
- Modify: `apps/web/tests/qr-code-image-static.test.ts` (point the QrCodeImage assertion at the new file)

This extracts the `PaymentPanel` function (currently lines 917-1057 of `self-order-client.tsx`) into its own module. It is the home of `QrCodeImage` usage after the split.

- [ ] **Step 1: Update the existing static test to point at the new file**

In `apps/web/tests/qr-code-image-static.test.ts`, the first test reads `app/q/[token]/self-order-client.tsx` and asserts the `QrCodeImage` import + usage. Change it to read the payment panel file instead. Replace the `selfOrder` read and its three assertions.

Change:
```ts
  const selfOrder = readWeb(
    "app/q/[token]/self-order-client.tsx",
  );
```
to:
```ts
  const selfOrderPayment = readWeb(
    "app/q/[token]/self-order/payment-panel.tsx",
  );
```

And change the three assertions that reference `selfOrder` to reference `selfOrderPayment`:
```ts
  assert.match(
    selfOrderPayment,
    /import \{ QrCodeImage \} from "@\/components\/qr-code-image"/,
  );
  assert.match(selfOrderPayment, /<QrCodeImage[\s\S]*value=\{vietQr\.qrData\}/);
  assert.doesNotMatch(selfOrderPayment, /import QRCode from "qrcode"/);
```

(The `assert.doesNotMatch(selfOrder, /function PaymentQrCode/)` line can be removed — it guarded against a stale local function that no longer applies after extraction.)

- [ ] **Step 2: Create the payment panel module**

Create `apps/web/app/q/[token]/self-order/payment-panel.tsx`. Copy the `PaymentPanel` function body verbatim from `self-order-client.tsx` lines 917-1057, including all imports it needs. The imports it needs (collected from the original): `cn` from `@comtammatu/ui`, `Badge`, `Button`, `Checkbox`, `Input`, `Item` family, `Label`, `Alert`, `AlertDescription`, `QrCodeImage`, `formatVND`, `SELF_ORDER_VI`, the icons (`IconReceipt`), and the types (`PublicSelfOrderSnapshot`, `VietQrState`).

Full file:

```tsx
"use client";

import { ReceiptText as IconReceipt } from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Input } from "@comtammatu/ui/components/input";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { QrCodeImage } from "@/components/qr-code-image";
import type { PublicSelfOrderSnapshot } from "@lib/self-order/contracts";

export interface VietQrState {
  qrData: string;
  amount: number;
  paymentCode: string;
  bankCode: string;
  accountNo: string;
  accountName: string;
}

export interface PaymentPanelProps {
  disabled: boolean;
  activeOrder: PublicSelfOrderSnapshot["order"] | null;
  buyerNotGetInvoice: boolean;
  buyerName: string;
  buyerTaxCode: string;
  buyerAddress: string;
  buyerEmail: string;
  isPending: boolean;
  error: string | null;
  vietQr: VietQrState | null;
  onBuyerNotGetInvoiceChange: (value: boolean) => void;
  onBuyerNameChange: (value: string) => void;
  onBuyerTaxCodeChange: (value: string) => void;
  onBuyerAddressChange: (value: string) => void;
  onBuyerEmailChange: (value: string) => void;
  onRequestPayment: (method: "cash_call" | "vietqr") => void;
}

export function PaymentPanel({
  disabled,
  activeOrder,
  buyerNotGetInvoice,
  buyerName,
  buyerTaxCode,
  buyerAddress,
  buyerEmail,
  isPending,
  error,
  vietQr,
  onBuyerNotGetInvoiceChange,
  onBuyerNameChange,
  onBuyerTaxCodeChange,
  onBuyerAddressChange,
  onBuyerEmailChange,
  onRequestPayment,
}: PaymentPanelProps) {
  return (
    <section className={cn("flex flex-col gap-3", disabled && "opacity-60")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading flex items-center gap-2 text-base font-semibold">
          <IconReceipt className="size-4" />
          {SELF_ORDER_VI.paymentTitle}
        </h2>
        {activeOrder ? (
          <Badge variant="outline">{formatVND(activeOrder.totalAmount)}</Badge>
        ) : null}
      </div>

      <Item variant="outline" className="flex-col items-stretch">
        <div className="mb-3 flex items-center gap-2">
          <Checkbox
            id="buyer-not-get-invoice"
            checked={buyerNotGetInvoice}
            onCheckedChange={(value) => {
              onBuyerNotGetInvoiceChange(value === true);
            }}
          />
          <Label htmlFor="buyer-not-get-invoice" className="text-sm">
            {SELF_ORDER_VI.buyerNoInvoice}
          </Label>
        </div>
        {!buyerNotGetInvoice ? (
          <div className="grid gap-2">
            <Input
              value={buyerName}
              placeholder={SELF_ORDER_VI.buyerName}
              onChange={(event) => onBuyerNameChange(event.target.value)}
            />
            <Input
              value={buyerTaxCode}
              placeholder={SELF_ORDER_VI.buyerTaxCode}
              onChange={(event) => onBuyerTaxCodeChange(event.target.value)}
            />
            <Input
              value={buyerAddress}
              placeholder={SELF_ORDER_VI.buyerAddress}
              onChange={(event) => onBuyerAddressChange(event.target.value)}
            />
            <Input
              value={buyerEmail}
              placeholder={SELF_ORDER_VI.buyerEmail}
              onChange={(event) => onBuyerEmailChange(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {SELF_ORDER_VI.buyerBusinessHint}
            </p>
          </div>
        ) : null}
      </Item>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <Button
          type="button"
          variant="outline"
          size="touch"
          disabled={disabled || isPending}
          onClick={() => onRequestPayment("cash_call")}
        >
          {SELF_ORDER_VI.cashCall}
        </Button>
        <Button
          type="button"
          size="touch"
          disabled={disabled || isPending}
          onClick={() => onRequestPayment("vietqr")}
        >
          {SELF_ORDER_VI.vietQrCreate}
        </Button>
      </div>

      {vietQr ? (
        <Item variant="outline" className="flex-col items-center text-center">
          <ItemContent className="items-center">
            <ItemTitle className="text-sm">
              {SELF_ORDER_VI.vietQrPendingTitle}
            </ItemTitle>
            <ItemDescription>
              {SELF_ORDER_VI.vietQrPendingDescription}
            </ItemDescription>
          </ItemContent>
          <QrCodeImage
            value={vietQr.qrData}
            alt={SELF_ORDER_VI.vietQrPendingTitle}
            className="mt-3 size-64 max-w-full"
          />
          <div className="mt-3 flex flex-col gap-1 text-sm">
            <p className="font-bold">{formatVND(vietQr.amount)}</p>
            <p className="break-all text-muted-foreground">
              {vietQr.paymentCode}
            </p>
          </div>
        </Item>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 3: Run tests to verify the static test passes**

Run: `cd apps/web && corepack pnpm test`
Expected: PASS for `qr-code-image-static.test.ts` (payment-panel now carries the import) AND the new phase1 test if it references payment-panel. Existing `self-order-client.tsx` still has the old inline `PaymentPanel` at this point — that's fine; the static test no longer reads it for QrCodeImage. We will delete the inline copy in Task 10.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/q/[token]/self-order/payment-panel.tsx apps/web/tests/qr-code-image-static.test.ts
git commit -m "refactor(self-order): extract payment panel (QrCodeImage home)"
```

---

## Task 8: Build the FAB cart sheet + sticky CTA bar

**Files:**
- Create: `apps/web/app/q/[token]/self-order/cart-sheet.tsx`

Implements fix B — mobile FAB opens a bottom sheet cart; a slim sticky bottom bar always shows subtotal + primary CTA.

- [ ] **Step 1: Add the failing test**

Append to `apps/web/tests/qr-self-order-v2-phase1.test.ts`:

```ts
test("cart-sheet has FAB trigger, bottom Sheet, sticky subtotal and touch-lg CTA", () => {
  const cart = readWeb("app/q/[token]/self-order/cart-sheet.tsx");

  assert.match(cart, /import \{ Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription \} from "@comtammatu\/ui\/components\/sheet"/);
  assert.match(cart, /fixed right-3 bottom-20/);
  assert.match(cart, /side="bottom"/);
  assert.match(cart, /size="icon-touch"/);
  assert.match(cart, /SELF_ORDER_VI\.cartTitle/);
  assert.match(cart, /SELF_ORDER_VI\.subtotal/);
  assert.match(cart, /formatVND/);
  assert.match(cart, /cartQuantity/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && corepack pnpm test`
Expected: FAIL — file not found.

- [ ] **Step 3: Write the component**

Create `apps/web/app/q/[token]/self-order/cart-sheet.tsx`. This combines: (a) a mobile FAB button that opens a bottom `Sheet` containing the cart lines, and (b) a desktop-aware cart body. The parent orchestrator decides mobile vs desktop layout; this component renders both the FAB+sheet (mobile) and the always-visible cart section (desktop), controlled by Tailwind responsive classes.

```tsx
"use client";

import { useState } from "react";
import {
  Minus as IconMinus,
  Plus as IconPlus,
  ShoppingCart as IconCart,
  Trash2 as IconTrash,
} from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Textarea } from "@comtammatu/ui/components/textarea";
import type { SelfOrderCartItem } from "@lib/self-order/contracts";

function lineTotal(item: SelfOrderCartItem) {
  const modifierTotal = item.modifiers.reduce((sum, modifier) => sum + modifier.price, 0);
  const sideTotal = item.sides.reduce((sum, side) => sum + side.price * side.quantity, 0);
  return (item.unit_price + modifierTotal + sideTotal) * item.quantity;
}

export interface CartSheetProps {
  items: SelfOrderCartItem[];
  total: number;
  quantity: number;
  isSubmitting: boolean;
  canSubmit: boolean;
  ctaLabel: string;
  ctaDisabledHint: string | null;
  customerNote: string;
  onCustomerNoteChange: (value: string) => void;
  onQuantityChange: (key: string, delta: number) => void;
  onRemove: (key: string) => void;
  onSubmit: () => void;
}

function CartLines({
  items,
  onQuantityChange,
  onRemove,
}: Pick<CartSheetProps, "items" | "onQuantityChange" | "onRemove">) {
  return (
    <ItemGroup data-size="xs">
      {items.map((item) => (
        <Item key={item.key} variant="outline" size="xs" className="justify-between">
          <ItemContent>
            <ItemTitle className="text-sm">
              {item.variant_name ? `${item.item_name} ${item.variant_name}` : item.item_name}
            </ItemTitle>
            <ItemDescription>{formatVND(lineTotal(item))}</ItemDescription>
          </ItemContent>
          <ItemActions className="gap-1">
            <Button type="button" variant="outline" size="icon-sm" onClick={() => onQuantityChange(item.key, -1)} aria-label="decrease">
              <IconMinus />
            </Button>
            <span className="w-8 text-center text-sm font-semibold tabular-nums">
              {item.quantity}
            </span>
            <Button type="button" variant="outline" size="icon-sm" onClick={() => onQuantityChange(item.key, 1)} aria-label="increase">
              <IconPlus />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onRemove(item.key)} aria-label={SELF_ORDER_VI.removeItem}>
              <IconTrash />
            </Button>
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}

function NoteField({
  customerNote,
  onCustomerNoteChange,
}: Pick<CartSheetProps, "customerNote" | "onCustomerNoteChange">) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="self-order-note">{SELF_ORDER_VI.noteLabel}</Label>
      <Textarea
        id="self-order-note"
        value={customerNote}
        maxLength={500}
        rows={2}
        placeholder={SELF_ORDER_VI.notePlaceholder}
        onChange={(event) => onCustomerNoteChange(event.target.value)}
      />
    </div>
  );
}

function SubmitCta({
  items,
  total,
  isSubmitting,
  canSubmit,
  ctaLabel,
  ctaDisabledHint,
  onSubmit,
}: Pick<CartSheetProps, "items" | "total" | "isSubmitting" | "canSubmit" | "ctaLabel" | "ctaDisabledHint" | "onSubmit">) {
  const disabled = !canSubmit || isSubmitting;
  return (
    <div className="flex flex-col gap-1">
      <Button type="button" size="touch-lg" className="w-full" disabled={disabled} onClick={onSubmit}>
        {isSubmitting ? SELF_ORDER_VI.submitting : ctaLabel}
      </Button>
      {disabled && ctaDisabledHint ? (
        <p className="text-center text-xs text-muted-foreground">{ctaDisabledHint}</p>
      ) : null}
    </div>
  );
}

export function CartSheet(props: CartSheetProps) {
  const { items, total, quantity, customerNote, ctaLabel, ctaDisabledHint } = props;
  const [open, setOpen] = useState(false);
  const empty = items.length === 0;

  const subtotalRow = (
    <div className="flex items-center justify-between text-sm font-semibold">
      <span>{SELF_ORDER_VI.subtotal}</span>
      <span className="tabular-nums">{formatVND(total)}</span>
    </div>
  );

  return (
    <>
      {/* Mobile: FAB opens bottom sheet */}
      <Button
        type="button"
        variant="default"
        size="icon-touch"
        className="fixed right-3 bottom-20 z-40 rounded-full shadow-lg lg:hidden"
        aria-label={SELF_ORDER_VI.cartTitle}
        onClick={() => setOpen(true)}
      >
        <IconCart />
        {quantity > 0 ? (
          <Badge variant="warning" className="absolute -right-1 -top-1">
            {quantity}
          </Badge>
        ) : null}
      </Button>

      {/* Mobile: bottom sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-dvh-95 p-0">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <IconCart className="size-4" />
              {SELF_ORDER_VI.cartTitle}
              {quantity > 0 ? <Badge variant="secondary">{quantity}</Badge> : null}
            </SheetTitle>
            <SheetDescription>{SELF_ORDER_VI.cartEmpty}</SheetDescription>
          </SheetHeader>
          <div className="flex max-h-[70dvh] flex-col gap-3 overflow-y-auto p-3">
            {empty ? (
              <Item variant="outline" className="border-dashed">
                <ItemDescription>{SELF_ORDER_VI.cartEmpty}</ItemDescription>
              </Item>
            ) : (
              <>
                <CartLines items={items} onQuantityChange={props.onQuantityChange} onRemove={props.onRemove} />
                <NoteField customerNote={customerNote} onCustomerNoteChange={props.onCustomerNoteChange} />
                {subtotalRow}
              </>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-2 border-t border-border/60 bg-background p-3">
            {subtotalRow}
            <SubmitCta
              items={items}
              total={total}
              isSubmitting={props.isSubmitting}
              canSubmit={props.canSubmit}
              ctaLabel={ctaLabel}
              ctaDisabledHint={ctaDisabledHint}
              onSubmit={props.onSubmit}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop (lg+): always-visible aside cart, pinned subtotal+CTA at bottom */}
      <section className="hidden flex-col gap-3 lg:flex">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading flex items-center gap-2 text-base font-semibold">
            <IconCart className="size-4" />
            {SELF_ORDER_VI.cartTitle}
          </h2>
          {quantity > 0 ? <Badge variant="secondary">{quantity}</Badge> : null}
        </div>
        {empty ? (
          <Item variant="outline" className="border-dashed">
            <ItemDescription>{SELF_ORDER_VI.cartEmpty}</ItemDescription>
          </Item>
        ) : (
          <div className="flex flex-col gap-2">
            <CartLines items={items} onQuantityChange={props.onQuantityChange} onRemove={props.onRemove} />
            <NoteField customerNote={customerNote} onCustomerNoteChange={props.onCustomerNoteChange} />
          </div>
        )}
        <div className="sticky bottom-0 -mx-3 flex shrink-0 flex-col gap-2 border-t border-border/60 bg-background px-3 py-3">
          {subtotalRow}
          <SubmitCta
            items={items}
            total={total}
            isSubmitting={props.isSubmitting}
            canSubmit={props.canSubmit}
            ctaLabel={ctaLabel}
            ctaDisabledHint={ctaDisabledHint}
            onSubmit={props.onSubmit}
          />
        </div>
      </section>
    </>
  );
}
```

Notes:
- `max-h-dvh-95` is the authorized bottom-sheet height utility (design-system.md § Rhythm).
- `size="icon-touch"` (48px) + `rounded-full` for the FAB, matching the approval-sheet FAB recipe but as a round cart button.
- `sticky bottom-0` desktop CTA follows the bill-receipt-sheet pattern (`-mx-4 -mb-4 ... border-t bg-...`); adjusted to `-mx-3`/`px-3` for the aside's `p-3` context.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && corepack pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/q/[token]/self-order/cart-sheet.tsx apps/web/tests/qr-self-order-v2-phase1.test.ts
git commit -m "feat(self-order): add FAB cart sheet with sticky subtotal and CTA"
```

---

## Task 9: Build the menu panel (extracted)

**Files:**
- Create: `apps/web/app/q/[token]/self-order/menu-panel.tsx`

Extracts the menu grid + search + tabs from the orchestrator. No behavior change; purely structural so the orchestrator shrinks. P2 will add the customize trigger here.

- [ ] **Step 1: Write the component**

Create `apps/web/app/q/[token]/self-order/menu-panel.tsx`. This holds `MenuItemGrid`, `MenuItemCard`, `MenuPhotoButton`, `MenuPhotoFrame`, `MenuPhotoContent` — copied verbatim from `self-order-client.tsx` lines 650-783 — plus a `MenuPanel` wrapper that renders the search input + tabs + grid. The search/tabs state stays in the orchestrator for now (passed down); P2 may localize it.

```tsx
"use client";

import { useCallback, type ChangeEvent } from "react";
import Image from "next/image";
import {
  Minus as IconMinus,
  Plus as IconPlus,
  Search as IconSearch,
  Utensils as IconUtensils,
  X as IconX,
} from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { AppEmptyState } from "@/components/surface";
import { normalizeSearch } from "@lib/search";
import type {
  SelfOrderMenuItem,
  SelfOrderMenuVariant,
  SelfOrderMenuCategory,
} from "@lib/self-order/contracts";

const ALL_MENU_VALUE = "all";

export interface MenuPanelProps {
  categories: SelfOrderMenuCategory[];
  activeCategoryValue: string;
  query: string;
  isSearchActive: boolean;
  onQueryChange: (value: string) => void;
  onActiveCategoryChange: (value: string) => void;
  onSearchActiveChange: (value: boolean) => void;
  onAdd: (item: SelfOrderMenuItem, variant?: SelfOrderMenuVariant) => void;
}

export function MenuPanel(props: MenuPanelProps) {
  const { categories, activeCategoryValue, query, isSearchActive } = props;

  const availableCategories = categories.filter((c) => c.menu_items.length > 0);
  const allMenuItemCount = availableCategories.reduce(
    (sum, c) => sum + c.menu_items.length,
    0,
  );
  const normalizedQuery = normalizeSearch(query).trim();
  const visibleCategories = normalizedQuery === ""
    ? availableCategories
    : availableCategories
        .map((category) => ({
          ...category,
          menu_items: category.menu_items.filter((item) =>
            normalizeSearch(`${item.name} ${item.description ?? ""}`).includes(normalizedQuery),
          ),
        }))
        .filter((category) => category.menu_items.length > 0);
  const visibleItems = activeCategoryValue === ALL_MENU_VALUE
    ? visibleCategories.flatMap((c) => c.menu_items)
    : visibleCategories.find((c) => String(c.id) === activeCategoryValue)?.menu_items ?? [];
  const isAllMenuActive = activeCategoryValue === ALL_MENU_VALUE;

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => props.onQueryChange(event.target.value),
    [props],
  );

  const searchInput = (
    <InputGroup className="h-11 w-full md:max-w-md lg:w-72 lg:flex-none">
      <InputGroupAddon><IconSearch /></InputGroupAddon>
      <InputGroupInput
        id="self-order-menu-search"
        value={query}
        onChange={handleQueryChange}
        autoFocus={isSearchActive}
        placeholder={SELF_ORDER_VI.searchPlaceholder}
        aria-label={SELF_ORDER_VI.searchAria}
      />
      {query.trim() !== "" ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label={SELF_ORDER_VI.clearSearchAria} onClick={() => props.onQueryChange("")}>
            <IconX />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );

  const tabPillClassName = "group/tab !flex-none gap-1.5 bg-muted/50 px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted data-[state=active]:bg-primary data-[state=active]:text-primary-foreground md:px-4";
  const tabBadgeClassName = "hidden shrink-0 text-xs sm:inline-flex group-data-[state=active]/tab:border-primary-foreground/30 group-data-[state=active]/tab:bg-primary-foreground/15 group-data-[state=active]/tab:text-primary-foreground";
  const unifiedTabs = (
    <Tabs value={activeCategoryValue} onValueChange={props.onActiveCategoryChange} className="no-scrollbar min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
      <TabsList aria-label={SELF_ORDER_VI.categoriesAria} className="!h-auto w-max min-w-full !justify-start gap-1.5 !bg-transparent !p-0 md:gap-2">
        <TabsTrigger value={ALL_MENU_VALUE} className={tabPillClassName}>
          {SELF_ORDER_VI.allCategories}
          <Badge variant="outline" className={tabBadgeClassName}>{allMenuItemCount}</Badge>
        </TabsTrigger>
        {availableCategories.map((category) => (
          <TabsTrigger key={category.id} value={String(category.id)} className={tabPillClassName}>
            {category.name}
            <Badge variant="outline" className={tabBadgeClassName}>{category.menu_items.length}</Badge>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );

  return (
    <section className="min-h-0 flex-1 lg:border-r lg:border-border">
      <div className="border-b border-border bg-background p-3">
        <div className="flex items-center gap-1.5 md:hidden">
          {isSearchActive ? (
            <>
              <div className="min-w-0 flex-1">{searchInput}</div>
              <Button type="button" variant="ghost" size="touch" className="shrink-0 px-3 text-sm font-semibold" onClick={() => { props.onSearchActiveChange(false); props.onQueryChange(""); }}>
                {SELF_ORDER_VI.cancelSearch}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" size="touch" className="min-w-12 shrink-0 bg-muted/50 px-0 text-muted-foreground hover:bg-muted" aria-label={SELF_ORDER_VI.searchAria} onClick={() => props.onSearchActiveChange(true)}>
                <IconSearch />
              </Button>
              {unifiedTabs}
            </>
          )}
        </div>
        <div className="hidden md:flex md:items-center md:gap-3">
          {searchInput}
          {unifiedTabs}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-3 pt-3">
        <h2 className="font-heading text-base font-semibold">{SELF_ORDER_VI.menuTitle}</h2>
      </div>
      <div className="flex flex-col gap-4 p-3">
        {availableCategories.length === 0 ? (
          <AppEmptyState title={SELF_ORDER_VI.menuEmpty} icon={<IconUtensils />} compact />
        ) : visibleItems.length === 0 ? (
          <AppEmptyState title={SELF_ORDER_VI.noResults} icon={<IconSearch />} compact />
        ) : isAllMenuActive ? (
          visibleCategories.map((category) => (
            <section key={category.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-heading truncate text-base font-semibold">{category.name}</h3>
                <Badge variant="outline">{category.menu_items.length}</Badge>
              </div>
              <MenuItemGrid items={category.menu_items} onAdd={props.onAdd} />
            </section>
          ))
        ) : (
          <MenuItemGrid items={visibleItems} onAdd={props.onAdd} />
        )}
      </div>
    </section>
  );
}

export function MenuItemGrid({
  items,
  onAdd,
}: {
  items: SelfOrderMenuItem[];
  onAdd: (item: SelfOrderMenuItem, variant?: SelfOrderMenuVariant) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {items.map((item) => (
        <MenuItemCard key={item.id} item={item} onAdd={onAdd} />
      ))}
    </div>
  );
}

function MenuItemCard({
  item,
  onAdd,
}: {
  item: SelfOrderMenuItem;
  onAdd: (item: SelfOrderMenuItem, variant?: SelfOrderMenuVariant) => void;
}) {
  const variants = item.menu_item_variants;
  if (variants.length === 0) {
    return <MenuPhotoButton item={item} onClick={() => onAdd(item)} />;
  }
  return (
    <Item variant="outline" className="block min-w-0 p-2">
      <MenuPhotoFrame item={item} />
      <div className="mt-2 grid gap-2">
        {variants.map((variant) => (
          <Button key={variant.id} type="button" variant="outline" size="touch" className="w-full justify-between" onClick={() => onAdd(item, variant)}>
            <span className="flex min-w-0 items-center gap-2">
              <IconPlus data-icon="inline-start" />
              <span className="min-w-0 truncate">{variant.name}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {formatVND(Number(item.base_price) + Number(variant.price_adjustment))}
            </span>
          </Button>
        ))}
      </div>
    </Item>
  );
}

function MenuPhotoButton({ item, onClick }: { item: SelfOrderMenuItem; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" aria-label={`${item.name}, ${formatVND(Number(item.base_price))}`} className="group relative aspect-square h-auto min-w-0 w-full overflow-hidden p-0 text-left transition-transform active:scale-[0.97]" onClick={onClick}>
      <MenuPhotoContent item={item} />
    </Button>
  );
}

function MenuPhotoFrame({ item }: { item: SelfOrderMenuItem }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted/50">
      <MenuPhotoContent item={item} />
    </div>
  );
}

function MenuPhotoContent({ item }: { item: SelfOrderMenuItem }) {
  return (
    <>
      <span className="absolute inset-0 block">
        {item.image_url ? (
          <Image src={item.image_url} alt="" fill sizes="(min-width: 1280px) 20vw, (min-width: 640px) 50vw, 50vw" className="object-cover" loading="lazy" decoding="async" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-muted/50">
            <IconUtensils className="size-6 text-muted-foreground" />
          </span>
        )}
      </span>
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      <span className="absolute right-2 top-2 inline-flex items-center rounded-md bg-primary px-2 py-1 text-sm font-bold tabular-nums text-primary-foreground">
        {formatVND(Number(item.base_price))}
      </span>
      <span className="absolute inset-x-2 bottom-2 line-clamp-2 text-sm font-bold leading-snug text-white">
        {item.name}
      </span>
    </>
  );
}
```

Note: `MenuItemGrid` is exported because P2 will reuse it. `MenuPanelProps` lifts search/tab state into the orchestrator (keeps the split minimal for P1).

- [ ] **Step 2: Typecheck**

Run: `corepack pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/q/[token]/self-order/menu-panel.tsx
git commit -m "refactor(self-order): extract menu panel with grid and search"
```

---

## Task 10: Rewire the orchestrator + implement CTA locking (fix I)

**Files:**
- Modify: `apps/web/app/q/[token]/self-order-client.tsx` (rewrite as slim orchestrator)

This is the capstone task: the orchestrator imports the folder modules, computes CTA state (fix I), and lays out the page with the status pill + FAB cart + order summary. The old inline `MenuItemGrid`/`MenuItemCard`/`PaymentPanel`/`SessionStatus` are removed.

- [ ] **Step 1: Add the failing test for CTA locking**

Append to `apps/web/tests/qr-self-order-v2-phase1.test.ts`:

```ts
test("orchestrator locks CTA while first batch is pending approval", () => {
  const orchestrator = readWeb("app/q/[token]/self-order-client.tsx");

  assert.match(orchestrator, /import \{ StatusPill \} from "\.\/self-order\/status-pill"/);
  assert.match(orchestrator, /import \{ CartSheet \} from "\.\/self-order\/cart-sheet"/);
  assert.match(orchestrator, /import \{ OrderSummary \} from "\.\/self-order\/order-summary"/);
  assert.match(orchestrator, /import \{ MenuPanel \} from "\.\/self-order\/menu-panel"/);
  assert.match(orchestrator, /import \{ PaymentPanel \} from "\.\/self-order\/payment-panel"/);
  assert.match(orchestrator, /import \{ useSnapshotSync \} from "\.\/self-order\/hooks"/);
  assert.match(orchestrator, /ctaAwaitingApproval/);
  assert.match(orchestrator, /isPendingApproval/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && corepack pnpm test`
Expected: FAIL — orchestrator not yet rewired.

- [ ] **Step 3: Rewrite the orchestrator**

Replace the entire contents of `apps/web/app/q/[token]/self-order-client.tsx` with the slim orchestrator below. It keeps all existing state (`cartItems`, `customerNote`, buyer fields, `vietQr`, submit/payment transitions) but delegates rendering to the extracted modules and adds CTA-state derivation.

```tsx
"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { RefreshCw as IconRefresh } from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { AppPage } from "@/components/surface";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import type {
  PublicSelfOrderSnapshot,
  SelfOrderCartItem,
  SelfOrderMenuItem,
  SelfOrderMenuVariant,
} from "@lib/self-order/contracts";
import { useSnapshotSync } from "./self-order/hooks";
import { StatusPill } from "./self-order/status-pill";
import { OrderSummary } from "./self-order/order-summary";
import { MenuPanel } from "./self-order/menu-panel";
import { CartSheet } from "./self-order/cart-sheet";
import { PaymentPanel, type VietQrState } from "./self-order/payment-panel";

interface SelfOrderClientProps {
  token: string;
  initialSnapshot: PublicSelfOrderSnapshot;
}

const TAX_CODE_PATTERN = /^\d{10}(-\d{3})?$/;

function newClientOpId() {
  return crypto.randomUUID();
}

function lineTotal(item: SelfOrderCartItem) {
  const modifierTotal = item.modifiers.reduce((sum, modifier) => sum + modifier.price, 0);
  const sideTotal = item.sides.reduce((sum, side) => sum + side.price * side.quantity, 0);
  return (item.unit_price + modifierTotal + sideTotal) * item.quantity;
}

function createCartItem(item: SelfOrderMenuItem, variant?: SelfOrderMenuVariant): SelfOrderCartItem {
  const sides = item.menu_item_available_sides
    .filter((side) => side.is_default)
    .map((side) => ({
      side_item_id: side.side_item.id,
      name: side.side_item.name,
      price: Number(side.side_item.base_price),
      quantity: 1,
      is_default: true,
    }));

  return {
    key: `${item.id}:${variant?.id ?? "base"}:${newClientOpId()}`,
    menu_item_id: item.id,
    item_name: item.name,
    variant_id: variant?.id,
    variant_name: variant?.name,
    quantity: 1,
    unit_price: Number(item.base_price) + Number(variant?.price_adjustment ?? 0),
    modifiers: [],
    sides,
  };
}

interface ApiError { ok: false; code?: string; message?: string; }

async function readApiResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as (Record<string, unknown> & { ok?: boolean }) | null;
  if (response.ok && payload?.ok !== false) return { ok: true, payload } as const;
  return {
    ok: false,
    error: {
      ok: false as const,
      code: typeof payload?.code === "string" ? payload.code : undefined,
      message: typeof payload?.message === "string" ? payload.message : undefined,
    },
  } as const;
}

export function SelfOrderClient({ token, initialSnapshot }: SelfOrderClientProps) {
  const { snapshot, refreshSnapshot } = useSnapshotSync(token, initialSnapshot);
  const [cartItems, setCartItems] = useState<SelfOrderCartItem[]>([]);
  const [customerNote, setCustomerNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [vietQr, setVietQr] = useState<VietQrState | null>(null);
  const [buyerNotGetInvoice, setBuyerNotGetInvoice] = useState(true);
  const [buyerName, setBuyerName] = useState("");
  const [buyerTaxCode, setBuyerTaxCode] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [activeCategoryValue, setActiveCategoryValue] = useState("all");
  const [query, setQuery] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isPaymentPending, startPaymentTransition] = useTransition();

  const cartTotal = useMemo(() => cartItems.reduce((sum, item) => sum + lineTotal(item), 0), [cartItems]);
  const cartQuantity = useMemo(() => cartItems.reduce((sum, item) => sum + item.quantity, 0), [cartItems]);

  const sessionStatus = snapshot.session?.status ?? null;
  const isSessionActive = sessionStatus === "active";
  const isPendingApproval = sessionStatus === "pending_approval";
  const hasPendingVietQr = snapshot.paymentRequest?.status === "vietqr_pending";
  const hasPendingCashCall = snapshot.paymentRequest?.status === "cash_call";
  const paymentLocked = hasPendingVietQr || hasPendingCashCall;
  const activeOrder = snapshot.order ?? null;
  const isClosed = sessionStatus === "closed" || (activeOrder?.paymentStatus === "active" && activeOrder?.paymentStatus === "paid");

  // CTA state (fix I)
  const ctaLabel = isClosed
    ? SELF_ORDER_VI.statusClosed
    : isPendingApproval
      ? SELF_ORDER_VI.ctaAwaitingApproval
      : isSessionActive
        ? SELF_ORDER_VI.submitAddMore
        : SELF_ORDER_VI.submitFirstBatch;
  const ctaDisabled = isClosed || isPendingApproval || paymentLocked;
  const ctaDisabledHint = isPendingApproval ? SELF_ORDER_VI.ctaAwaitingApprovalHint : null;

  function addItem(item: SelfOrderMenuItem, variant?: SelfOrderMenuVariant) {
    setSubmitError(null);
    setCartItems((current) => [...current, createCartItem(item, variant)]);
  }

  function updateQuantity(key: string, delta: number) {
    setCartItems((current) =>
      current
        .map((item) => (item.key === key ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item))
        .filter((item) => item.quantity > 0),
    );
  }

  function removeItem(key: string) {
    setCartItems((current) => current.filter((item) => item.key !== key));
  }

  function buildInvoicePayload() {
    if (buyerNotGetInvoice) return { buyerNotGetInvoice: true };
    const taxCode = buyerTaxCode.trim();
    if (taxCode && !TAX_CODE_PATTERN.test(taxCode)) {
      return { error: SELF_ORDER_VI.buyerTaxInvalid } as const;
    }
    if (taxCode && (!buyerName.trim() || !buyerAddress.trim())) {
      return { error: SELF_ORDER_VI.buyerBusinessMissing } as const;
    }
    return {
      buyerNotGetInvoice: false,
      buyerName: buyerName.trim() || undefined,
      buyerTaxCode: taxCode || undefined,
      buyerAddress: buyerAddress.trim() || undefined,
      buyerEmail: buyerEmail.trim() || undefined,
    };
  }

  async function postBatch(path: string) {
    return fetch(`/api/self-order/${encodeURIComponent(token)}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientOpId: newClientOpId(), items: cartItems, customerNote: customerNote.trim() || undefined }),
    });
  }

  function submitBatch() {
    if (cartItems.length === 0 || isPending || ctaDisabled) return;
    setSubmitError(null);
    startTransition(async () => {
      const response = await postBatch("batches");
      const result = await readApiResponse(response);
      if (!result.ok && result.error.code === "pending_payment_exists") {
        const confirmed = await confirm({
          title: SELF_ORDER_VI.pendingPaymentBlocked,
          description: SELF_ORDER_VI.pendingPaymentConfirm,
          confirmText: SELF_ORDER_VI.submitAddMore,
          cancelText: SELF_ORDER_VI.keepPendingPayment,
        });
        if (!confirmed) {
          setSubmitError(result.error.message ?? SELF_ORDER_VI.pendingPaymentBlocked);
          return;
        }
        const cancelResponse = await postBatch("cancel-pending-payment-and-add");
        const cancelResult = await readApiResponse(cancelResponse);
        if (!cancelResult.ok) {
          setSubmitError(cancelResult.error.message ?? SELF_ORDER_VI.submitFailed);
          await refreshSnapshot();
          return;
        }
        setCartItems([]);
        setCustomerNote("");
        setVietQr(null);
        await refreshSnapshot();
        return;
      }
      if (!result.ok) {
        setSubmitError(result.error.message ?? SELF_ORDER_VI.submitFailed);
        return;
      }
      setCartItems([]);
      setCustomerNote("");
      await refreshSnapshot();
    });
  }

  function requestPayment(method: "cash_call" | "vietqr") {
    if (!isSessionActive || isPaymentPending) return;
    setPaymentError(null);
    startPaymentTransition(async () => {
      const invoice = buildInvoicePayload();
      if ("error" in invoice) {
        setPaymentError(invoice.error ?? SELF_ORDER_VI.paymentFailed);
        return;
      }
      const response = await fetch(`/api/self-order/${encodeURIComponent(token)}/payment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientOpId: newClientOpId(), method, invoice }),
      });
      const result = await readApiResponse(response);
      if (!result.ok) {
        setPaymentError(result.error.message ?? SELF_ORDER_VI.paymentFailed);
        return;
      }
      if (method === "vietqr") {
        setVietQr(result.payload as unknown as VietQrState);
      } else {
        setVietQr(null);
      }
      await refreshSnapshot();
    });
  }

  const handleCategoryChange = useCallback((value: string) => {
    if (value !== "all" && !(snapshot.menu ?? []).some((c) => String(c.id) === value)) return;
    setActiveCategoryValue(value);
  }, [snapshot.menu]);

  return (
    <AppPage width="full" density="compact" className="min-h-dvh bg-background text-foreground pb-28 lg:pb-0" contentClassName="min-h-dvh max-w-none">
      <div className="flex min-h-dvh w-full flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-background p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-muted-foreground">
                {snapshot.branch?.name ?? SELF_ORDER_VI.branchFallback}
              </p>
              <h1 className="font-heading truncate text-xl font-semibold">
                {snapshot.table ? SELF_ORDER_VI.tableLabel(snapshot.table.number) : SELF_ORDER_VI.menuTitle}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill session={snapshot.session} paymentRequest={snapshot.paymentRequest} order={snapshot.order} />
              <Button type="button" variant="outline" size="icon-touch" onClick={() => void refreshSnapshot()} aria-label="refresh">
                <IconRefresh />
              </Button>
            </div>
          </div>
        </header>

        {isSessionActive && activeOrder ? (
          <div className="border-b border-border bg-background px-3 py-2">
            <OrderSummary items={activeOrder.items} />
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <MenuPanel
            categories={snapshot.menu ?? []}
            activeCategoryValue={activeCategoryValue}
            query={query}
            isSearchActive={isSearchActive}
            onQueryChange={setQuery}
            onActiveCategoryChange={handleCategoryChange}
            onSearchActiveChange={setIsSearchActive}
            onAdd={addItem}
          />

          <aside className="border-t border-border bg-card lg:sticky lg:top-0 lg:z-10 lg:h-dvh lg:w-96 lg:overflow-y-auto lg:border-l lg:border-t-0">
            <div className="flex flex-col gap-4 p-3">
              <CartSheet
                items={cartItems}
                total={cartTotal}
                quantity={cartQuantity}
                isSubmitting={isPending}
                canSubmit={cartItems.length > 0}
                ctaLabel={ctaLabel}
                ctaDisabledHint={ctaDisabledHint}
                customerNote={customerNote}
                onCustomerNoteChange={setCustomerNote}
                onQuantityChange={updateQuantity}
                onRemove={removeItem}
                onSubmit={submitBatch}
              />
              <PaymentPanel
                disabled={!isSessionActive}
                activeOrder={activeOrder}
                buyerNotGetInvoice={buyerNotGetInvoice}
                buyerName={buyerName}
                buyerTaxCode={buyerTaxCode}
                buyerAddress={buyerAddress}
                buyerEmail={buyerEmail}
                isPending={isPaymentPending}
                error={paymentError}
                vietQr={vietQr}
                onBuyerNotGetInvoiceChange={setBuyerNotGetInvoice}
                onBuyerNameChange={setBuyerName}
                onBuyerTaxCodeChange={setBuyerTaxCode}
                onBuyerAddressChange={setBuyerAddress}
                onBuyerEmailChange={setBuyerEmail}
                onRequestPayment={requestPayment}
              />
            </div>
          </aside>
        </div>
      </div>
      {submitError ? (
        <Alert variant="destructive" className="fixed inset-x-3 bottom-3 z-40 lg:left-3 lg:right-auto lg:max-w-md">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}
    </AppPage>
  );
}
```

Key changes vs the old orchestrator:
- `ctaLabel` / `ctaDisabled` / `ctaDisabledHint` derived from session state → fix I (locks CTA while `pending_approval`, while payment pending, and when closed).
- `submitBatch` early-returns when `ctaDisabled`.
- `StatusPill` replaces `SessionStatus`.
- `OrderSummary` shows `activeOrder.items` when active.
- `CartSheet` (FAB + desktop aside) replaces the inline `CartPanel`.
- `pb-28` on the page root gives room for the mobile FAB + bottom bar.

- [ ] **Step 4: Run the full test suite**

Run: `cd apps/web && corepack pnpm test`
Expected: PASS for all tests including the new orchestrator CTA-lock test and the updated `qr-code-image-static.test.ts`.

- [ ] **Step 5: Typecheck**

Run: `corepack pnpm typecheck`
Expected: PASS. If a now-unused import lingers (e.g. `Item` family, `Tabs`, `Textarea`, icons only used by extracted panels), remove it. The orchestrator above already imports only what it uses.

- [ ] **Step 6: Lint**

Run: `corepack pnpm lint`
Expected: PASS. The lint guard includes `client-storage`, `ui-contract`, `copy`, and `i18n:no-grow` — new copy keys are in `SELF_ORDER_VI` (Vietnamese, consistent), so no growth violation.

- [ ] **Step 7: Build**

Run: `corepack pnpm build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/q/[token]/self-order-client.tsx apps/web/tests/qr-self-order-v2-phase1.test.ts
git commit -m "feat(self-order): rewire orchestrator with status pill, FAB cart, CTA locking"
```

---

## Task 11: Apply migration + regenerate types + CodeGraph refresh

**Files:** none (operational)

- [ ] **Step 1: Verify migration target ref**

Per `docs/agent/rules/database.md`, confirm the dev/test Supabase ref against the Environment Registry before applying. Only apply to approved dev/test, never production.

- [ ] **Step 2: Apply the migration to the dev/test database**

Run: `corepack pnpm supabase db push` (or the project's documented apply command). Confirm `self_order_get_snapshot` now returns `order.items`.

- [ ] **Step 3: Regenerate types**

Run: `corepack pnpm db:types`
Expected: `apps/web/types/supabase.ts` (or wherever generated types live) refreshed. The generated RPC return type may widen; consumers only read scalar fields so this is safe.

- [ ] **Step 4: Re-typecheck after types regenerated**

Run: `corepack pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Refresh CodeGraph**

Run: `codegraph index .`
Expected: success; graph reflects the new `self-order/` folder and split files.

- [ ] **Step 6: Commit regenerated types**

```bash
git add -A
git commit -m "chore(self-order): regenerate supabase types after snapshot items migration"
```

---

## Task 12: Manual smoke + final verification

- [ ] **Step 1: Full gate**

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build && corepack pnpm test`
Expected: all PASS.

- [ ] **Step 2: Manual smoke (dev server)**

Run: `corepack pnpm dev`, then open a valid self-order token URL `/q/<token>`:

1. **Pending approval path:** with an empty session, add items, submit. Verify the CTA shows "Đang chờ duyệt lô đầu" and is disabled (cannot submit a second batch). Verify the status pill reads "Đang chờ nhân viên duyệt".
2. **Active path:** after staff approves (via the approval sheet), verify the "Món đã gọi" section appears with the ordered items, the status pill reads "Đang gọi món", and the CTA shows "Gọi thêm món".
3. **Payment lock path:** trigger a VietQR payment request. Verify the pill reads "Đang chờ thanh toán QR" and adding more items is blocked (existing cancel-then-add flow still reachable).
4. **Mobile layout:** resize to mobile width. Verify the FAB cart appears bottom-right, opens the bottom sheet, and the submit CTA is reachable inside the sheet.
5. **Desktop layout:** at lg+ width, verify the right aside shows the cart inline with a pinned subtotal+CTA at the bottom.

- [ ] **Step 3: Update worklog**

Append to `docs/worklog/2026-07-08-qr-self-order-v1.md` (or create a `docs/worklog/2026-07-08-qr-self-order-v2-phase1.md`) noting Phase 1 shipped, the one additive migration, and the file split. Commit.

---

## Self-Review (completed during authoring)

**1. Spec coverage (Phase 1 section of the spec):**
- P1.1 status pill (fix A) → Task 5 + wired in Task 10. ✓
- P1.2 FAB cart + sticky CTA (fix B) → Task 8 + wired in Task 10. ✓
- P1.3 already-ordered summary (fix E) → Task 6 + Task 1 (SQL) + Task 2 (type) + wired in Task 10. ✓
- P1.4 CTA locking (fix I) → Task 10 (`ctaDisabled`, `ctaLabel`, early return). ✓
- File split → Tasks 4, 5, 6, 7, 8, 9, 10. ✓
- Additive snapshot change → Task 1. ✓

**2. Placeholder scan:** No TBD/TODO. The only deferred item (print-agent job type) belongs to Phase 3, not this plan.

**3. Type consistency:**
- `SelfOrderOrderLine` defined in Task 2, used in Task 6 (`OrderSummary`) and returned by the Task 1 RPC (`menuItemId`, `itemName`, `variantId`, `variantName`, `quantity`, `unitPrice`, `lineTotal`, `note` — camelCase matches the jsonb keys in the migration). ✓
- `VietQrState` moved to `payment-panel.tsx` (Task 7) and imported by the orchestrator (Task 10). ✓
- `CartSheetProps` fields match what the orchestrator passes in Task 10. ✓
- `MenuPanelProps` fields match orchestrator usage. ✓

**4. Ambiguity fixed:** Task 10's `isClosed` derivation simplified — closed state is `session.status === "closed"`; the payment-paid case surfaces via the pill. Removed a convoluted boolean.
