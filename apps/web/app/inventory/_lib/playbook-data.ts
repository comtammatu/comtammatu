import { canAccess, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import {
  currentUserHasPermission,
  currentUserHasPermissionAny,
} from "@/_lib/permissions";
import {
  fetchExpiryAlerts,
  fetchReorderAlerts,
  fetchStocktakeSessions,
} from "../actions";
import { fetchGrns } from "../grn-actions";
import { fetchPurchaseOrders } from "../purchase-order-actions";
import { fetchStockTransfers } from "../transfer-actions";
import { resolveInventoryBranchScope } from "./inventory-scope";
import { formatDate } from "./format";
import {
  PRICE_VARIANCE_THRESHOLD_PCT,
  sortPlaybookTasks,
  type PlaybookExpiryLot,
  type PlaybookGrnDraft,
  type PlaybookPoRow,
  type PlaybookPriceReviewLine,
  type PlaybookReorderItem,
  type PlaybookStocktakeSession,
  type PlaybookTask,
  type PlaybookTransferRow,
  type PlaybookTransferSuggestionPair,
} from "./playbook-types";

type BranchKind = "central_warehouse" | "central_kitchen" | "branch";

function isProcurementKind(kind: string): boolean {
  return kind === "central_warehouse" || kind === "central_kitchen";
}

const EXPIRY_URGENT_DAYS = 3;

export interface InventoryPlaybook {
  branchId: number | null;
  branchKind: BranchKind;
  branchName: string;
  tasks: PlaybookTask[];
  /** Computed at — for "Tính lúc HH:mm" hint in UI. */
  computedAt: string;
}

export async function loadInventoryPlaybook(
  requestedBranchId: number | null,
): Promise<InventoryPlaybook> {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryBranchScope(
    supabase,
    claims,
    requestedBranchId,
  );
  const branchId = scope.selectedBranchId;
  const selectedBranch = scope.allowedBranches.find((b) => b.id === branchId);
  const branchKindRaw = selectedBranch?.branch_kind ?? "branch";
  const branchKind: BranchKind =
    branchKindRaw === "central_warehouse"
      ? "central_warehouse"
      : branchKindRaw === "central_kitchen"
        ? "central_kitchen"
        : "branch";
  const branchName = selectedBranch?.name ?? "";

  if (branchId == null) {
    return {
      branchId: null,
      branchKind,
      branchName,
      tasks: [],
      computedAt: new Date().toISOString(),
    };
  }

  // Permission gates determine which task categories we even bother fetching.
  const isProcurementBranch = isProcurementKind(branchKind);
  const showProcurement =
    canAccess(claims.user_role, "inventory_procurement") &&
    (await currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ));
  const [canSendPo, canCreateTransfer, canCreateStocktake] = await Promise.all([
    currentUserHasPermission(branchId, PERMISSION_KEYS.PROCUREMENT_PO_CREATE),
    currentUserHasPermission(branchId, PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE),
    currentUserHasPermission(branchId, PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE),
  ]);

  const wantsProcurementTasks = isProcurementBranch && showProcurement;

  const [
    poRes,
    grnRes,
    transferRes,
    stocktakeRes,
    reorderRes,
    expiryRes,
    priceReviewRes,
    transferSuggestionPairs,
  ] = await Promise.all([
    wantsProcurementTasks
      ? fetchPurchaseOrders(branchId)
      : Promise.resolve({ success: true as const, data: [] }),
    wantsProcurementTasks
      ? fetchGrns(branchId)
      : Promise.resolve({ success: true as const, data: [] }),
    canCreateTransfer
      ? fetchStockTransfers(branchId)
      : Promise.resolve({ success: true as const, data: [] }),
    canCreateStocktake
      ? fetchStocktakeSessions(branchId)
      : Promise.resolve({ success: true as const, data: [] }),
    wantsProcurementTasks
      ? fetchReorderAlerts(branchId)
      : Promise.resolve({ success: true as const, data: [] }),
    fetchExpiryAlerts(branchId),
    wantsProcurementTasks
      ? fetchPriceReviewLines(supabase, claims.tenant_id, branchId)
      : Promise.resolve([] as PlaybookPriceReviewLine[]),
    canCreateTransfer
      ? fetchTransferSuggestions(
          supabase,
          claims.tenant_id,
          branchId,
          branchKind,
        )
      : Promise.resolve([] as PlaybookTransferSuggestionPair[]),
  ]);

  const tasks: PlaybookTask[] = [];

  // ── 1. PO drafts cần gửi (procurement only, requires po_create) ──
  if (wantsProcurementTasks && canSendPo && poRes.success && poRes.data) {
    const drafts = (
      poRes.data as Array<{
        id: number;
        po_number: string;
        status: string;
        branch_id: number;
        suppliers: { id: number; name: string } | null;
        purchase_order_items: Array<{ line_total: number | null }>;
      }>
    )
      .filter((row) => row.status === "draft" && row.branch_id === branchId)
      .map<PlaybookPoRow>((row) => ({
        id: row.id,
        po_number: row.po_number,
        supplier_name: row.suppliers?.name ?? "Chưa gắn NCC",
        line_count: row.purchase_order_items?.length ?? 0,
        branch_id: row.branch_id,
      }))
      // Only allow sending POs that actually have lines (server will reject otherwise).
      .filter((row) => row.line_count > 0);
    if (drafts.length > 0) {
      tasks.push({
        kind: "po_draft_pending",
        severity: "warning",
        branch_id: branchId,
        pos: drafts,
      });
    }
  }

  // ── 2. NL chạm reorder ──
  if (wantsProcurementTasks && reorderRes.success && reorderRes.data) {
    const items = (
      reorderRes.data as Array<{
        ingredient_id: number;
        ingredient_name: string;
        current_quantity: number;
        reorder_point: number;
        unit: string;
        branch_id: number;
      }>
    )
      .filter((row) => row.branch_id === branchId)
      .map<PlaybookReorderItem>((row) => ({
        ingredient_id: row.ingredient_id,
        name: row.ingredient_name,
        current: row.current_quantity,
        reorder: row.reorder_point,
        unit: row.unit,
      }));
    if (items.length > 0) {
      tasks.push({
        kind: "reorder_critical",
        severity: "destructive",
        branch_id: branchId,
        branch_kind: branchKind,
        ingredients: items,
      });
    }
  } else if (
    !isProcurementBranch &&
    canCreateTransfer &&
    reorderRes.success &&
    reorderRes.data
  ) {
    // Operational branch: same alert but action will be Smart Requisition.
    const items = (
      reorderRes.data as Array<{
        ingredient_id: number;
        ingredient_name: string;
        current_quantity: number;
        reorder_point: number;
        unit: string;
        branch_id: number;
      }>
    )
      .filter((row) => row.branch_id === branchId)
      .map<PlaybookReorderItem>((row) => ({
        ingredient_id: row.ingredient_id,
        name: row.ingredient_name,
        current: row.current_quantity,
        reorder: row.reorder_point,
        unit: row.unit,
      }));
    if (items.length > 0) {
      tasks.push({
        kind: "reorder_critical",
        severity: "destructive",
        branch_id: branchId,
        branch_kind: branchKind,
        ingredients: items,
      });
    }
  }

  // ── 3 + 4. Transfers ──
  if (canCreateTransfer && transferRes.success && transferRes.data) {
    const rawTransfers = transferRes.data as Array<{
      id: number;
      transfer_number: string;
      status: string;
      from_branch_id: number;
      to_branch_id: number;
      from_branch_name: string;
      to_branch_name: string;
    }>;
    const inbound = rawTransfers
      .filter(
        (t) =>
          t.to_branch_id === branchId &&
          (t.status === "in_transit" || t.status === "confirmed_ship"),
      )
      .map<PlaybookTransferRow>((t) => ({
        id: t.id,
        transfer_number: t.transfer_number,
        from_branch_name: t.from_branch_name,
        to_branch_name: t.to_branch_name,
        status: t.status,
      }));
    if (inbound.length > 0) {
      tasks.push({
        kind: "transfer_inbound_unconfirmed",
        severity: "primary",
        branch_id: branchId,
        transfers: inbound,
      });
    }

    if (isProcurementBranch) {
      const outbound = rawTransfers
        .filter(
          (t) =>
            t.from_branch_id === branchId &&
            (t.status === "draft" || t.status === "confirmed_ship"),
        )
        .map<PlaybookTransferRow>((t) => ({
          id: t.id,
          transfer_number: t.transfer_number,
          from_branch_name: t.from_branch_name,
          to_branch_name: t.to_branch_name,
          status: t.status,
        }));
      if (outbound.length > 0) {
        tasks.push({
          kind: "transfer_outbound_pending",
          severity: "info",
          branch_id: branchId,
          transfers: outbound,
        });
      }
    }
  }

  // ── 5. Lô cận hạn ≤ 3 ngày ──
  if (expiryRes.success && expiryRes.data) {
    const lots = (
      expiryRes.data as Array<{
        ingredient_id: number;
        ingredient_name: string;
        batch_number: string | null;
        expiry_date: string;
        days_remaining: number;
      }>
    )
      .filter((row) => row.days_remaining <= EXPIRY_URGENT_DAYS)
      .map<PlaybookExpiryLot>((row) => ({
        ingredient_id: row.ingredient_id,
        ingredient_name: row.ingredient_name,
        lot: row.batch_number ?? "",
        expiry_date: formatDate(row.expiry_date),
        days_left: row.days_remaining,
      }));
    if (lots.length > 0) {
      const hasExpired = lots.some((lot) => lot.days_left <= 0);
      tasks.push({
        kind: "expiry_urgent",
        severity: hasExpired ? "destructive" : "warning",
        branch_id: branchId,
        lots,
      });
    }
  }

  // ── 6. Open stocktake sessions ──
  if (canCreateStocktake && stocktakeRes.success && stocktakeRes.data) {
    const sessions = (
      stocktakeRes.data as Array<{
        id: number;
        status: string;
        total_items: number | null;
        counted_items: number | null;
        branches: { id: number; name: string } | null;
      }>
    )
      .filter((row) => row.status === "in_progress")
      .map<PlaybookStocktakeSession>((row) => {
        const total = Number(row.total_items ?? 0);
        const counted = Number(row.counted_items ?? 0);
        return {
          id: row.id,
          branch_id: row.branches?.id ?? branchId,
          branch_name: row.branches?.name ?? branchName,
          progress: total > 0 ? Math.round((counted / total) * 100) : 0,
          counted,
          total,
        };
      });
    if (sessions.length > 0) {
      tasks.push({
        kind: "stocktake_in_progress",
        severity: "info",
        sessions,
      });
    }
  }

  // ── 7. GRN drafts ──
  if (wantsProcurementTasks && grnRes.success && grnRes.data) {
    const drafts = (
      grnRes.data as Array<{
        id: number;
        grn_number: string;
        status: string;
        branch_id: number;
        suppliers: { id: number; name: string } | null;
      }>
    )
      .filter((row) => row.status === "draft" && row.branch_id === branchId)
      .map<PlaybookGrnDraft>((row) => ({
        id: row.id,
        grn_number: row.grn_number,
        supplier_name: row.suppliers?.name ?? "Chưa gắn NCC",
        branch_id: row.branch_id,
      }));
    if (drafts.length > 0) {
      tasks.push({
        kind: "grn_draft_pending",
        severity: "info",
        branch_id: branchId,
        grns: drafts,
      });
    }
  }

  // ── 8. GRN price review (variance > threshold in last 30 days) ──
  if (wantsProcurementTasks && priceReviewRes.length > 0) {
    tasks.push({
      kind: "price_review_pending",
      severity: "warning",
      lines: priceReviewRes,
    });
  }

  // ── 9. Transfer suggestions (CW over → branch low matching) ──
  // Skip ingredients already covered by reorder_critical for the current
  // branch — they get a more direct action there. This keeps the playbook
  // free of duplicate calls-to-action on the same SKU.
  if (canCreateTransfer && transferSuggestionPairs.length > 0) {
    const reorderTask = tasks.find((t) => t.kind === "reorder_critical");
    const dedupeIds = new Set(
      reorderTask && reorderTask.kind === "reorder_critical"
        ? reorderTask.ingredients.map((i) => i.ingredient_id)
        : [],
    );
    const filteredPairs = dedupeIds.size
      ? transferSuggestionPairs
          .map<PlaybookTransferSuggestionPair>((pair) => ({
            ...pair,
            ingredients: pair.ingredients.filter(
              (ing) => !dedupeIds.has(ing.ingredient_id),
            ),
          }))
          .filter((pair) => pair.ingredients.length > 0)
      : transferSuggestionPairs;

    if (filteredPairs.length > 0) {
      tasks.push({
        kind: "transfer_suggestion",
        severity: "info",
        branch_id: branchId,
        branch_kind: branchKind,
        pairs: filteredPairs,
      });
    }
  }

  return {
    branchId,
    branchKind,
    branchName,
    tasks: sortPlaybookTasks(tasks),
    computedAt: new Date().toISOString(),
  };
}

/**
 * Aggregate price-variance review signal from `grn_items.baseline_variance_pct`.
 * Replaces the hardcoded `priceReviewCount = 0` in dashboard-data.ts.
 */
async function fetchPriceReviewLines(
  supabase: Awaited<ReturnType<typeof loadAuthState>>["supabase"],
  tenantId: number,
  branchId: number,
): Promise<PlaybookPriceReviewLine[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("grn_items")
    .select(
      "ingredient_id, baseline_variance_pct, ingredients ( id, name ), goods_received_notes!inner ( id, grn_number, branch_id, status, received_date )",
    )
    .eq("tenant_id", tenantId)
    .eq("goods_received_notes.branch_id", branchId)
    .eq("goods_received_notes.status", "confirmed")
    .gte("goods_received_notes.received_date", cutoffIso)
    .not("baseline_variance_pct", "is", null);

  if (error || !data) return [];

  const lines: PlaybookPriceReviewLine[] = [];
  for (const row of data) {
    const variance = row.baseline_variance_pct;
    if (variance == null || Math.abs(variance) <= PRICE_VARIANCE_THRESHOLD_PCT) {
      continue;
    }
    const grn = row.goods_received_notes as unknown as {
      id: number;
      grn_number: string;
    } | null;
    const ing = row.ingredients as unknown as { id: number; name: string } | null;
    if (!grn) continue;
    lines.push({
      grn_id: grn.id,
      grn_number: grn.grn_number,
      ingredient_name: ing?.name ?? `#${row.ingredient_id}`,
      variance_pct: Math.round(variance * 10) / 10,
    });
  }
  // Cap to 20 lines so the task card stays readable.
  return lines.slice(0, 20);
}

interface StockLevelJoinRow {
  branch_id: number;
  current_quantity: number;
  ingredients: {
    id: number;
    name: string;
    unit: string;
    purchase_unit: string | null;
    reorder_point: number | null;
    max_stock_level: number | null;
    is_active: boolean | null;
  } | null;
  branches: {
    id: number;
    name: string;
    branch_kind: string | null;
  } | null;
}

/**
 * Build (source → target) transfer pairs for the current branch context.
 * Picks operational rows where `current_quantity ≤ reorder_point` (low) and
 * procurement rows where `current_quantity > max_stock_level` (over) on the
 * same ingredient. Quantity per pair is `min(deficit, surplus)` clamped > 0,
 * with surplus consumed FIFO across target branches by `branch_id` ASC.
 *
 * Branch-scope filter:
 *   - procurement branch viewing → only pairs where `from = currentBranchId`
 *   - operational branch viewing → only pairs where `to   = currentBranchId`
 */
async function fetchTransferSuggestions(
  supabase: Awaited<ReturnType<typeof loadAuthState>>["supabase"],
  tenantId: number,
  currentBranchId: number,
  currentBranchKind: BranchKind,
): Promise<PlaybookTransferSuggestionPair[]> {
  const { data, error } = await supabase
    .from("stock_levels")
    .select(
      `
      branch_id,
      current_quantity,
      ingredients!inner (
        id, name, unit, purchase_unit, reorder_point, max_stock_level, is_active
      ),
      branches!inner ( id, name, branch_kind )
    `,
    )
    .eq("tenant_id", tenantId)
    .eq("ingredients.is_active", true)
    .not("ingredients.reorder_point", "is", null)
    .not("ingredients.max_stock_level", "is", null);

  if (error || !data) return [];

  type LowRow = {
    branch_id: number;
    branch_name: string;
    deficit: number;
    current: number;
    reorder: number;
  };
  type OverRow = {
    branch_id: number;
    branch_name: string;
    surplus: number;
    current: number;
  };
  type IngredientBucket = {
    ingredient_id: number;
    name: string;
    unit: string;
    lows: LowRow[];
    overs: OverRow[];
  };

  const buckets = new Map<number, IngredientBucket>();
  for (const row of data as unknown as StockLevelJoinRow[]) {
    const ing = row.ingredients;
    const br = row.branches;
    if (!ing || !br) continue;
    const reorder = ing.reorder_point;
    const maxStock = ing.max_stock_level;
    if (reorder == null || maxStock == null) continue;

    const isProcurement =
      br.branch_kind === "central_warehouse" ||
      br.branch_kind === "central_kitchen";
    const isOperational = br.branch_kind === "branch";

    const isLow = isOperational && row.current_quantity <= reorder;
    const isOver = isProcurement && row.current_quantity > maxStock;
    if (!isLow && !isOver) continue;

    const bucket =
      buckets.get(ing.id) ??
      ({
        ingredient_id: ing.id,
        name: ing.name,
        unit: ing.purchase_unit || ing.unit,
        lows: [],
        overs: [],
      } as IngredientBucket);

    if (isLow) {
      bucket.lows.push({
        branch_id: row.branch_id,
        branch_name: br.name,
        deficit: reorder - row.current_quantity,
        current: row.current_quantity,
        reorder,
      });
    }
    if (isOver) {
      bucket.overs.push({
        branch_id: row.branch_id,
        branch_name: br.name,
        surplus: row.current_quantity - maxStock,
        current: row.current_quantity,
      });
    }
    buckets.set(ing.id, bucket);
  }

  // Compose (source, target) pairs. Allocate surplus FIFO across the target
  // branches by branch_id ASC so the same low branch isn't starved when
  // multiple sites compete for a limited surplus.
  const pairsMap = new Map<string, PlaybookTransferSuggestionPair>();
  for (const bucket of buckets.values()) {
    if (bucket.lows.length === 0 || bucket.overs.length === 0) continue;
    bucket.lows.sort((a, b) => a.branch_id - b.branch_id);
    bucket.overs.sort((a, b) => a.branch_id - b.branch_id);

    // Pick the largest-surplus source for now (simple v1 — refine later if
    // operations want round-robin across multiple CWs).
    const source = bucket.overs.reduce(
      (best, cur) => (cur.surplus > best.surplus ? cur : best),
      bucket.overs[0]!,
    );
    let remainingSurplus = source.surplus;

    for (const low of bucket.lows) {
      if (remainingSurplus <= 0) break;
      const qty = Math.floor(Math.min(low.deficit, remainingSurplus));
      if (qty <= 0) continue;
      remainingSurplus -= qty;

      const pairKey = `${source.branch_id}->${low.branch_id}`;
      const pair =
        pairsMap.get(pairKey) ??
        ({
          from_branch_id: source.branch_id,
          from_branch_name: source.branch_name,
          to_branch_id: low.branch_id,
          to_branch_name: low.branch_name,
          ingredients: [],
        } as PlaybookTransferSuggestionPair);
      pair.ingredients.push({
        ingredient_id: bucket.ingredient_id,
        name: bucket.name,
        unit: bucket.unit,
        current_target: low.current,
        current_source: source.current,
        suggested_qty: qty,
      });
      pairsMap.set(pairKey, pair);
    }
  }

  // Branch-scope: only pairs where the current branch participates.
  const isProcurementBranch =
    currentBranchKind === "central_warehouse" ||
    currentBranchKind === "central_kitchen";
  const filtered: PlaybookTransferSuggestionPair[] = [];
  for (const pair of pairsMap.values()) {
    if (isProcurementBranch) {
      if (pair.from_branch_id !== currentBranchId) continue;
    } else {
      if (pair.to_branch_id !== currentBranchId) continue;
    }
    filtered.push(pair);
  }

  // Stable order: lowest from_branch_id then to_branch_id. Cap to 6 pairs
  // so the card stays readable; surplus signal is still surfaced.
  filtered.sort(
    (a, b) =>
      a.from_branch_id - b.from_branch_id ||
      a.to_branch_id - b.to_branch_id,
  );
  return filtered.slice(0, 6);
}
