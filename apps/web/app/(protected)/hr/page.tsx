import { fetchEmployees } from "./actions";
import {
  fetchChecklistTemplates,
  fetchPositionDefaults,
} from "./checklist-actions";
import type {
  ConsumptionChecklistItemRow,
  ConsumptionDefaultIngredientRow,
  ConsumptionDefaultItemRow,
  PositionDefaultRow,
} from "./checklist-types";
import { HrClient } from "./hr-client";
import { loadAuthState } from "@/_lib/auth";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";

export default async function HrPage() {
  const { supabase, claims } = await loadAuthState();
  const copy = messages.hr.workspace;
  const canManageEmployees = claims.user_role === "owner";
  const isBranchManager = claims.user_role === "branch_manager";
  const canViewEmployees = canManageEmployees || isBranchManager;

  const branchesPromise =
    isBranchManager && claims.branch_id == null
      ? Promise.resolve({ data: [] as BranchOption[] })
      : (() => {
          let query = supabase
            .from("branches")
            .select("id, name")
            .eq("tenant_id", claims.tenant_id)
            .eq("is_active", true)
            .order("name");

          if (isBranchManager && claims.branch_id != null) {
            query = query.eq("id", claims.branch_id);
          }

          return query;
        })();

  const [
    employeesResult,
    checklistResult,
    positionDefaultsResult,
    { data: branches },
  ] = await Promise.all([
    canViewEmployees
      ? fetchEmployees()
      : Promise.resolve({ success: true, data: [] }),
    fetchChecklistTemplates(),
    canManageEmployees
      ? fetchPositionDefaults()
      : Promise.resolve({ success: true, data: [] }),
    branchesPromise,
  ]);

  const employees = employeesResult.success
    ? ((employeesResult.data as EmployeeRow[]) ?? [])
    : [];

  const branchOptions = (branches ?? []) as BranchOption[];
  const checklistTemplates = checklistResult.success
    ? (checklistResult.data ?? [])
    : [];
  const positionDefaults = positionDefaultsResult.success
    ? ((positionDefaultsResult.data as PositionDefaultRow[]) ?? [])
    : [];
  const consumptionChecklistItems: ConsumptionChecklistItemRow[] =
    checklistTemplates.flatMap((template) =>
      template.items.flatMap((item) =>
        item.id != null && item.taskKind === "consumption_report"
          ? [
              {
                templateItemId: item.id,
                templateName: template.name,
                branchName: template.branchName,
              },
            ]
          : [],
      ),
    );
  const consumptionTemplateItemIds = consumptionChecklistItems.map(
    (item) => item.templateItemId,
  );
  const service = createServiceClient();
  const [ingredientsResult, defaultsResult] =
    consumptionTemplateItemIds.length > 0
      ? await Promise.all([
          service
            .from("ingredients")
            .select("id, name, unit, purchase_unit, category")
            .eq("tenant_id", claims.tenant_id)
            .eq("is_active", true)
            .order("name"),
          service
            .from("shift_checklist_consumption_default_items")
            .select("template_item_id, ingredient_id")
            .eq("tenant_id", claims.tenant_id)
            .eq("is_active", true)
            .in("template_item_id", consumptionTemplateItemIds),
        ])
      : [{ data: [] }, { data: [] }];
  const consumptionIngredients = (
    ingredientsResult.data ?? []
  ).map<ConsumptionDefaultIngredientRow>((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    unit: ingredient.purchase_unit || ingredient.unit,
    category: ingredient.category ?? null,
  }));
  const consumptionDefaults = (
    defaultsResult.data ?? []
  ).map<ConsumptionDefaultItemRow>((item) => ({
    templateItemId: item.template_item_id,
    ingredientId: item.ingredient_id,
  }));

  return (
    <AppPage width="wide">
      <AppPageHeader
        eyebrow={copy.eyebrow}
        title={isBranchManager ? copy.branchManagerTitle : copy.ownerTitle}
        description={
          isBranchManager
            ? copy.branchManagerDescription
            : copy.ownerDescription
        }
      />
      <HrClient
        employees={employees}
        branches={branchOptions}
        canManageEmployees={canManageEmployees}
        canViewEmployees={canViewEmployees}
        checklistTemplates={checklistTemplates}
        consumptionChecklistItems={consumptionChecklistItems}
        consumptionIngredients={consumptionIngredients}
        consumptionDefaults={consumptionDefaults}
        canManageGlobalChecklist={canManageEmployees}
        positionDefaults={positionDefaults}
      />
    </AppPage>
  );
}

// Re-export types so client components can share them
export interface BranchOption {
  id: number;
  name: string;
}

export interface EmployeeRow {
  id: number;
  employee_code: string | null;
  id_number: string | null;
  bank_account: string | null;
  bank_name: string | null;
  base_salary: number | null;
  start_date: string | null;
  contract_type: string | null;
  dependents_count: number;
  is_active: boolean;
  default_checklist_template_id: number | null;
  profiles: {
    id: string;
    full_name: string;
    phone: string | null;
    positions: {
      code: string | null;
      label_vi: string | null;
      default_checklist_template_id: number | null;
    } | null;
    branch_id: number | null;
    branches: { name: string } | null;
  } | null;
}

export interface ShiftRow {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
}
