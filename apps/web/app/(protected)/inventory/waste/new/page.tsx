import { redirect } from "next/navigation";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { getAuthContextWithPermission } from "@/(protected)/inventory/_lib/auth";
import {
  INVENTORY_FEATURE_FLAGS,
  isFeatureEnabledForBranch,
} from "@/(protected)/inventory/_lib/feature-flags";
import { parseBranchIdParam } from "@/(protected)/inventory/_lib/inventory-scope";
import { getWasteCapStatus } from "@/(protected)/inventory/waste-actions";
import { AppPage, AppPageHeader, AppEmptyState } from "@/components/surface";
import type { WasteFormContext } from "@lib/inventory/waste-create-model";
import {
  getDefaultIssueUnit,
  getIssueUnitOptions,
} from "@/(protected)/inventory/_lib/issue-units";
import { messages } from "@lib/messages";
import { WasteCreateClient } from "./waste-create-client";

export const dynamic = "force-dynamic";

interface WasteNewPageContentProps {
  searchParams?: Promise<{ branchId?: string }>;
}

function renderWasteUnavailable({
  title,
  description,
  mode = "no-access",
}: {
  title: string;
  description: string;
  mode?: "no-access" | "error";
}) {
  return (
    <AppPage width="default">
      <AppPageHeader title={INVENTORY_VI.createWasteTitle} />
      <AppEmptyState mode={mode} title={title} description={description} />
    </AppPage>
  );
}

export async function WasteNewPageContent({
  searchParams,
}: WasteNewPageContentProps) {
  const params = searchParams ? await searchParams : {};
  const branchId = parseBranchIdParam(params.branchId);

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_WRITEOFF,
    branchId,
  );
  if (!ctx) redirect("/");
  const { supabase, claims } = ctx;

  if (branchId === null) {
    return renderWasteUnavailable({
      title: INVENTORY_VI.branchRequiredTitle,
      description: INVENTORY_VI.branchRequiredWasteHint,
    });
  }
  const fallbackHref = `/inventory/consumption?branchId=${branchId}`;

  const flagEnabled = await isFeatureEnabledForBranch(
    supabase,
    branchId,
    INVENTORY_FEATURE_FLAGS.S11_WASTE_TIER,
  );
  if (!flagEnabled) {
    redirect(fallbackHref);
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
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .eq("location_kind", "warehouse")
      .order("sort_order", { ascending: true }),
    supabase
      .from("ingredients")
      .select(
        "id, name, ingredient_units!ingredient_units_ingredient_tenant_fkey(unit_id, to_base_factor, is_base, is_active, sort_order, units!ingredient_units_unit_tenant_fkey(code, name))",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    getWasteCapStatus(branchId),
  ]);
  const { data: stockLevels, error: stockLevelsError } = await supabase
    .from("stock_levels")
    .select("ingredient_id, location_id, current_quantity")
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", branchId);

  if (
    branchRes.error ||
    locationsRes.error ||
    ingredientsRes.error ||
    stockLevelsError ||
    !capRes.success ||
    !capRes.data
  ) {
    return renderWasteUnavailable({
      mode: "error",
      title: messages.inventory.waste.loadFailedTitle,
      description: messages.inventory.waste.loadFailedDescription,
    });
  }

  if (!branchRes.data) {
    redirect(fallbackHref);
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
      const units = (i.ingredient_units ?? [])
        .filter((u) => u.is_active !== false && (u.units?.code ?? "") !== "")
        .map((u) => ({
          id: u.unit_id,
          unit_id: u.unit_id,
          unit_code: u.units?.code ?? "",
          unit_name: u.units?.name ?? u.units?.code ?? "",
          to_base_factor: Number(u.to_base_factor ?? 1),
          is_base: u.is_base,
          is_active: true,
          sort_order: u.sort_order,
        }));
      const ingredient = { units };
      const issueUnits = getIssueUnitOptions(ingredient);
      const defaultUnit = getDefaultIssueUnit(ingredient);
      const ingredientStockLevels = (stockLevels ?? [])
        .filter((level) => level.ingredient_id === i.id)
        .map((level) => ({
          locationId: level.location_id,
          quantity: Number(level.current_quantity ?? 0),
        }));
      return {
        id: i.id,
        name: i.name,
        unit: defaultUnit?.label ?? issueUnits[0]?.label ?? "kg",
        issueUnits,
        stockLevels: ingredientStockLevels,
      };
    }),
    capStatus: capRes.data,
  };

  return <WasteCreateClient context={context} />;
}

export default async function WasteNewPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  return <WasteNewPageContent searchParams={searchParams} />;
}
