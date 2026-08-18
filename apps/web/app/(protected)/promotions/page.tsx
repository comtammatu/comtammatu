import Link from "next/link";
import { Plus as IconPlus } from "lucide-react";
import { PROMOTIONS_VI } from "@comtammatu/shared/messages";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
} from "@/components/surface";
import { ResponsiveActionButton } from "@/components/responsive-action-button";
import { loadPromotionsAuth } from "./actions";
import { PromotionsListClient } from "./promotions-list-client";
import type { PromotionListRow } from "./promotions-list-client";

export default async function PromotionsPage() {
  const ctx = await loadPromotionsAuth();
  if (!ctx) {
    return (
      <AppPage width="xwide" density="compact">
        <AppPageHeader title={PROMOTIONS_VI.title} />
        <AppEmptyState
          mode="no-access"
          description={PROMOTIONS_VI.loadFailed}
        />
      </AppPage>
    );
  }

  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("promotions")
    .select(
      "id, name, kind, status, discount_type, discount_value, min_subtotal, max_discount_amount, bxgy_buy_qty, bxgy_get_qty, free_side_qty, free_item_qty, starts_at, ends_at, updated_at, promotion_codes(code, kind, status)",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <AppPage width="xwide" density="compact">
        <AppPageHeader title={PROMOTIONS_VI.title} />
        <AppEmptyState mode="error" description={PROMOTIONS_VI.loadFailed} />
      </AppPage>
    );
  }

  const rows: PromotionListRow[] = (data ?? []).map((row) => {
    const rawCodes = row.promotion_codes;
    const codes: Array<{ code: string; kind: string; status: string }> =
      Array.isArray(rawCodes) ? rawCodes : rawCodes ? [rawCodes] : [];
    const reusable = codes.find(
      (code) => code.kind === "reusable" && code.status === "active",
    );
    const uniqueCodes = codes.filter((code) => code.kind === "unique");
    const activeCodes = codes.filter((code) => code.status === "active");
    const redeemedCodes = codes.filter((code) => code.status === "redeemed");

    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      status: row.status,
      discountType: row.discount_type,
      discountValue: row.discount_value != null ? Number(row.discount_value) : null,
      minSubtotal: Number(row.min_subtotal ?? 0),
      maxDiscountAmount:
        row.max_discount_amount != null ? Number(row.max_discount_amount) : null,
      bxgyBuyQty: row.bxgy_buy_qty,
      bxgyGetQty: row.bxgy_get_qty,
      freeSideQty: row.free_side_qty,
      freeItemQty: row.free_item_qty,
      reusableCode: reusable?.code ?? null,
      totalCodesCount: codes.length,
      uniqueCodesCount: uniqueCodes.length,
      activeCodesCount: activeCodes.length,
      redeemedCodesCount: redeemedCodes.length,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    };
  });

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={PROMOTIONS_VI.title}
        actions={
          <ResponsiveActionButton
            density="header"
            render={<Link href="/promotions/new" />}
          >
            <IconPlus data-icon="inline-start" />
            {PROMOTIONS_VI.create}
          </ResponsiveActionButton>
        }
      />
      <PromotionsListClient rows={rows} />
    </AppPage>
  );
}
