import { redirect } from "next/navigation";
import { PROMOTIONS_VI } from "@comtammatu/shared/messages";
import { loadPromotionsAuth } from "../actions";
import { PromotionForm } from "../promotion-form";

export default async function NewPromotionPage() {
  const ctx = await loadPromotionsAuth();
  if (!ctx) redirect("/access-denied?reason=module");
  const { supabase, claims } = ctx;

  const [{ data: branches }, { data: menuItems }] = await Promise.all([
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
  ]);

  return (
    <PromotionForm
      title={PROMOTIONS_VI.newTitle}
      branches={branches ?? []}
      menuItems={menuItems ?? []}
      initial={{
        name: "",
        kind: "order_pct",
        status: "draft",
        discountType: "pct",
        discountValue: 10,
        minSubtotal: 0,
        maxDiscountAmount: null,
        stackWithItemDiscount: true,
        startsAt: null,
        endsAt: null,
        timeWindows: [],
        serviceModes: ["dine_in", "takeaway"],
        bxgyBuyQty: 2,
        bxgyGetQty: 1,
        freeSideQty: 1,
        freeItemQty: null,
        allowCode: true,
        allowAuto: false,
        branchIds: [],
        itemIds: [],
        buyItemIds: [],
        getItemIds: [],
        reusableCode: "",
      }}
    />
  );
}
