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
      "id, name, kind, status, discount_type, discount_value, starts_at, ends_at, updated_at, promotion_codes(code, kind, status)",
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
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      status: row.status,
      discountType: row.discount_type,
      discountValue: row.discount_value,
      reusableCode: reusable?.code ?? null,
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
