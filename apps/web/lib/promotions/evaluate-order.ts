import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@comtammatu/database";
import { mapPromotionRpcError } from "./rpc-errors";

export type FreeSideCandidate = {
  order_item_id: number;
  side_item_id: number;
  name: string;
  unit_price: number;
  max_units: number;
  parent_name: string;
};

export type FreeSideOffer = {
  promotion_id: number;
  name: string;
  kind: "free_side";
  free_qty: number;
  candidates: FreeSideCandidate[];
  amount_hint: number;
  needs_side_selection: boolean;
  allow_code: boolean;
  allow_auto: boolean;
  code: string | null;
};

export type EvaluateOrderPromotionsResult = {
  order_id: number;
  promotion_id: number | null;
  offers: FreeSideOffer[];
};

function parseCandidates(raw: unknown): FreeSideCandidate[] {
  if (!Array.isArray(raw)) return [];
  const out: FreeSideCandidate[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const orderItemId = Number(r.order_item_id);
    const sideItemId = Number(r.side_item_id);
    const maxUnits = Number(r.max_units);
    const unitPrice = Number(r.unit_price);
    if (
      !Number.isFinite(orderItemId) ||
      !Number.isFinite(sideItemId) ||
      !Number.isFinite(maxUnits) ||
      maxUnits < 1
    ) {
      continue;
    }
    out.push({
      order_item_id: orderItemId,
      side_item_id: sideItemId,
      name: String(r.name ?? "Ăn kèm"),
      unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
      max_units: maxUnits,
      parent_name: String(r.parent_name ?? ""),
    });
  }
  return out;
}

export function parseFreeSideOffers(raw: unknown): FreeSideOffer[] {
  if (!Array.isArray(raw)) return [];
  const out: FreeSideOffer[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const promotionId = Number(r.promotion_id);
    const freeQty = Number(r.free_qty);
    if (!Number.isFinite(promotionId) || !Number.isFinite(freeQty) || freeQty < 1) {
      continue;
    }
    const candidates = parseCandidates(r.candidates);
    if (candidates.length < 1) continue;
    out.push({
      promotion_id: promotionId,
      name: String(r.name ?? ""),
      kind: "free_side",
      free_qty: freeQty,
      candidates,
      amount_hint: Number(r.amount_hint ?? 0),
      needs_side_selection: r.needs_side_selection === true,
      allow_code: r.allow_code === true,
      allow_auto: r.allow_auto === true,
      code:
        typeof r.code === "string" && r.code.trim() !== "" ? r.code.trim() : null,
    });
  }
  return out;
}

export async function evaluateOrderPromotionsQuiet(
  supabase: SupabaseClient<Database>,
  orderId: number,
): Promise<EvaluateOrderPromotionsResult | null> {
  const { data, error } = await supabase.rpc("evaluate_order_promotions", {
    p_order_id: orderId,
  });
  if (error) {
    console.error("[evaluate_order_promotions]", error.message);
    return null;
  }
  const result = data as {
    order_id?: number;
    promotion_id?: number | null;
    offers?: Json;
  } | null;
  if (!result) return null;
  return {
    order_id: Number(result.order_id ?? orderId),
    promotion_id:
      result.promotion_id == null ? null : Number(result.promotion_id),
    offers: parseFreeSideOffers(result.offers),
  };
}

export async function evaluateOrderPromotionsBlocking(
  supabase: SupabaseClient<Database>,
  orderId: number,
): Promise<string | null> {
  const { error } = await supabase.rpc("evaluate_order_promotions", {
    p_order_id: orderId,
  });
  if (!error) return null;
  return mapPromotionRpcError(error.message);
}

export async function evaluateOrderPromotionsWithOffers(
  supabase: SupabaseClient<Database>,
  orderId: number,
): Promise<EvaluateOrderPromotionsResult | null> {
  return evaluateOrderPromotionsQuiet(supabase, orderId);
}
