import { redirect } from "next/navigation";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "@/inventory/_lib/auth";
import {
  INVENTORY_FEATURE_FLAGS,
  isFeatureEnabledForBranch,
} from "@/inventory/_lib/feature-flags";
import { resolveRequestedBranchId } from "@/inventory/_lib/inventory-scope";
import { getWasteCapStatus } from "@/inventory/waste-actions";
import { AppPage, AppPageHeader, AppEmptyState } from "@/components/surface";
import { WasteCreateClient, type WasteFormContext } from "./waste-create-client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ branchId?: string }>;
}

export default async function WasteNewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const branchId = await resolveRequestedBranchId(params.branchId);

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_WRITEOFF,
  );
  if (!ctx) redirect("/");
  const { supabase, claims } = ctx;

  if (branchId === null) {
    return (
      <AppPage width="default">
        <AppPageHeader title="Tạo phiếu hao hụt" />
        <AppEmptyState
          mode="no-access"
          title="Cần chọn chi nhánh"
          description="Chọn chi nhánh ở thanh điều hướng trước khi tạo phiếu hao hụt mới."
        />
      </AppPage>
    );
  }

  // Feature flag gate: S11 waste redesign must be enabled per-branch before UI shows
  const flagEnabled = await isFeatureEnabledForBranch(
    supabase,
    branchId,
    INVENTORY_FEATURE_FLAGS.S11_WASTE_TIER,
  );
  if (!flagEnabled) {
    redirect(`/inventory/issues?branchId=${branchId}&error=waste_v2_not_enabled`);
  }

  // Fetch branch detail + locations at this branch + active ingredients
  const [branchRes, locationsRes, ingredientsRes, capRes] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, branch_kind")
      .eq("id", branchId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle(),
    supabase
      .from("inventory_locations")
      .select("id, name, location_kind")
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("ingredients")
      .select("id, name, unit, purchase_unit, unit_cost")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    getWasteCapStatus(branchId),
  ]);

  if (!branchRes.data) {
    redirect(`/inventory/issues?branchId=${branchId}&error=branch_not_found`);
  }

  const context: WasteFormContext = {
    tenantId: claims.tenant_id,
    branch: {
      id: branchRes.data.id,
      name: branchRes.data.name,
      kind: branchRes.data.branch_kind ?? "branch",
    },
    locations: (locationsRes.data ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      kind: l.location_kind ?? "warehouse",
    })),
    ingredients: (ingredientsRes.data ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.purchase_unit ?? i.unit ?? "kg",
      unitCost: i.unit_cost === null ? null : Number(i.unit_cost),
    })),
    capStatus:
      capRes.success && capRes.data
        ? capRes.data
        : {
            shiftKey: "",
            shiftSum: 0,
            shiftCap: 1_500_000,
            branchToday: 0,
            branchCap: 500_000,
          },
  };

  return <WasteCreateClient context={context} />;
}
