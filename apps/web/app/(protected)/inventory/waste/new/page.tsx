import { redirect } from "next/navigation";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { getAuthContextWithPermission } from "@/(protected)/inventory/_lib/auth";
import {
  INVENTORY_FEATURE_FLAGS,
  isFeatureEnabledForBranch,
} from "@/(protected)/inventory/_lib/feature-flags";
import { resolveRequestedBranchId } from "@/(protected)/inventory/_lib/inventory-scope";
import { getWasteCapStatus } from "@/(protected)/inventory/waste-actions";
import { AppPage, AppPageHeader, AppEmptyState } from "@/components/surface";
import {
  WasteCreateClient,
  type WasteFormContext,
} from "./waste-create-client";

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
        <AppPageHeader title={INVENTORY_VI.createWasteTitle} />
        <AppEmptyState
          mode="no-access"
          title={INVENTORY_VI.branchRequiredTitle}
          description={INVENTORY_VI.branchRequiredWasteHint}
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
    redirect(`/inventory/issues?branchId=${branchId}`);
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
      .select(
        "id, name, unit, purchase_unit, unit_cost, ingredient_units(unit_id, is_base, allow_issue, sort_order, units(code))",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    getWasteCapStatus(branchId),
  ]);

  if (!branchRes.data) {
    redirect(`/inventory/issues?branchId=${branchId}`);
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
    ingredients: (ingredientsRes.data ?? []).map((i) => {
      const issueUnits = (i.ingredient_units ?? [])
        .filter((u) => u.allow_issue && (u.units?.code ?? "") !== "")
        .sort((a, b) => {
          if (a.is_base !== b.is_base) return a.is_base ? -1 : 1;
          return a.sort_order - b.sort_order;
        })
        .map((u) => ({
          unitId: u.unit_id,
          code: u.units?.code ?? "",
          isBase: u.is_base,
        }));
      return {
        id: i.id,
        name: i.name,
        unit: i.purchase_unit ?? i.unit ?? "kg",
        unitCost: i.unit_cost === null ? null : Number(i.unit_cost),
        issueUnits,
      };
    }),
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
