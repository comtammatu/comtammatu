import { notFound, redirect } from "next/navigation";
import { PROMOTIONS_VI } from "@comtammatu/shared/messages";
import {
  PROMOTION_KINDS,
  PROMOTION_STATUSES,
  type PromotionKind,
  type PromotionStatus,
} from "@lib/promotions/kinds";
import { loadPromotionsAuth } from "../actions";
import { PromotionForm } from "../promotion-form";

function isKind(value: string): value is PromotionKind {
  return (PROMOTION_KINDS as readonly string[]).includes(value);
}

function isStatus(value: string): value is PromotionStatus {
  return (PROMOTION_STATUSES as readonly string[]).includes(value);
}

export default async function EditPromotionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const ctx = await loadPromotionsAuth();
  if (!ctx) redirect("/access-denied?reason=module");
  const { supabase, claims } = ctx;

  const [promoRes, branchRes, itemRes, codeRes, targetRes] = await Promise.all([
    supabase
      .from("promotions")
      .select(
        "id, name, kind, status, discount_type, discount_value, min_subtotal, max_discount_amount, stack_with_item_discount, starts_at, ends_at, time_windows, service_modes, bxgy_buy_qty, bxgy_get_qty, free_side_qty, allow_code, allow_auto",
      )
      .eq("id", id)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle(),
    supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_kind", "branch")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("menu_items")
      .select("id, name")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("promotion_codes")
      .select("id, code, kind, status, face_value")
      .eq("promotion_id", id)
      .eq("tenant_id", claims.tenant_id)
      .order("issued_at", { ascending: false })
      .limit(200),
    supabase
      .from("promotion_branches")
      .select("branch_id")
      .eq("promotion_id", id),
  ]);

  const promo = promoRes.data;
  if (!promo || !isKind(promo.kind) || !isStatus(promo.status)) {
    notFound();
  }
  const reusable = (codeRes.data ?? []).find((code) => code.kind === "reusable");
  const itemTargets = await supabase
    .from("promotion_items")
    .select("menu_item_id, item_role")
    .eq("promotion_id", id);

  const timeWindows = Array.isArray(promo.time_windows)
    ? promo.time_windows.flatMap((window) => {
        if (
          window &&
          typeof window === "object" &&
          "dow" in window &&
          "start" in window &&
          "end" in window
        ) {
          return [
            {
              dow: Number(window.dow),
              start: String(window.start),
              end: String(window.end),
            },
          ];
        }
        return [];
      })
    : [];

  const serviceModes = (promo.service_modes ?? []).filter(
    (mode): mode is "dine_in" | "takeaway" =>
      mode === "dine_in" || mode === "takeaway",
  );

  return (
    <PromotionForm
      title={PROMOTIONS_VI.editTitle}
      branches={branchRes.data ?? []}
      menuItems={itemRes.data ?? []}
      codes={(codeRes.data ?? [])
        .filter((code) => code.kind === "unique")
        .map((code) => ({
          id: code.id,
          code: code.code,
          kind: code.kind,
          status: code.status,
          faceValue: code.face_value,
        }))}
      initial={{
        id: promo.id,
        name: promo.name,
        kind: promo.kind,
        status: promo.status,
        discountType:
          promo.discount_type === "pct" || promo.discount_type === "vnd"
            ? promo.discount_type
            : null,
        discountValue: promo.discount_value,
        minSubtotal: Number(promo.min_subtotal ?? 0),
        maxDiscountAmount: promo.max_discount_amount,
        stackWithItemDiscount: promo.stack_with_item_discount,
        startsAt: promo.starts_at,
        endsAt: promo.ends_at,
        timeWindows,
        serviceModes:
          serviceModes.length > 0 ? serviceModes : ["dine_in", "takeaway"],
        bxgyBuyQty: promo.bxgy_buy_qty,
        bxgyGetQty: promo.bxgy_get_qty,
        freeSideQty: promo.free_side_qty,
        allowCode: promo.allow_code,
        allowAuto: promo.allow_auto,
        branchIds: (targetRes.data ?? []).map((row) => row.branch_id),
        itemIds: (itemTargets.data ?? [])
          .filter((row) => row.item_role === "eligible")
          .map((row) => row.menu_item_id),
        buyItemIds: (itemTargets.data ?? [])
          .filter((row) => row.item_role === "buy")
          .map((row) => row.menu_item_id),
        getItemIds: (itemTargets.data ?? [])
          .filter((row) => row.item_role === "get")
          .map((row) => row.menu_item_id),
        reusableCode: reusable?.code ?? "",
      }}
    />
  );
}
