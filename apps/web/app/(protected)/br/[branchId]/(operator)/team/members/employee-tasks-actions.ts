"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Json } from "@comtammatu/database";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import { messages } from "@lib/messages";
import {
  POSITION_TASK_APPLICABILITY,
  POSITION_TASK_KINDS,
  POSITION_TASK_PHASES,
  type EmployeeSummary,
  type EmployeeTaskTemplate,
  type PositionTaskIngredientOption,
  type PositionTaskRow,
} from "@/(protected)/hr/position-task-types";
import type { PositionTasksData } from "@/(protected)/hr/position-tasks-actions";

const BRANCH_TASK_ROLES: readonly StaffRole[] = ["owner", "branch_manager"];

const taskErrors = messages.hr.client.positionTasks.errors;

const positionTaskInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  kind: z.enum(POSITION_TASK_KINDS).default("standard"),
  applicability: z.enum(POSITION_TASK_APPLICABILITY).default("every_shift"),
  phase: z.enum(POSITION_TASK_PHASES).default("start_of_shift"),
  isRequired: z.boolean().default(true),
  allowsPhoto: z.boolean().default(false),
  doneDefinition: z.string().trim().max(240).default(""),
  ingredientIds: z
    .array(z.coerce.number().int().positive())
    .max(80)
    .default([]),
});

const branchEmployeeSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive(),
});

const saveBranchEmployeeTasksSchema = branchEmployeeSchema.extend({
  tasks: z.array(positionTaskInputSchema).max(40),
});

type PositionTaskDbRow = {
  id: number;
  position_id: number;
  title: string;
  kind: string;
  applicability: string;
  phase: string;
  is_required: boolean;
  allows_photo: boolean;
  done_definition: string;
  sort_order: number;
};

type ConsumptionDefaultDbRow = {
  position_task_id: number | null;
  template_item_id: number | null;
  ingredient_id: number;
};

type IngredientDbRow = {
  id: number;
  name: string;
  ingredient_units?:
    | { is_base: boolean; units: { code: string } | null }[]
    | null;
};

function mapPositionTaskError(message: string | undefined): string {
  if (!message) return messages.hr.client.positionTasks.saveFailed;
  for (const key of Object.keys(taskErrors) as (keyof typeof taskErrors)[]) {
    if (message.includes(key)) return taskErrors[key];
  }
  return messages.hr.client.positionTasks.saveFailed;
}

function revalidateBranchTaskPaths(branchId: number) {
  revalidatePath(`/br/${branchId}/team`);
  revalidatePath(`/br/${branchId}/team/attendance`);
  revalidatePath(`/${"hr"}`);
}

export type BranchEmployeeShiftTasksData = PositionTasksData & {
  hasOverride: boolean;
};

export const loadBranchEmployeeShiftTasks = withAction(
  {
    roles: BRANCH_TASK_ROLES,
    schema: branchEmployeeSchema,
    permission: PERMISSION_KEYS.HR_MANAGE_EMPLOYEE_SHIFT_OVERRIDES,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { claims }) => {
    if (
      claims.user_role === "branch_manager" &&
      claims.branch_id !== data.branchId
    ) {
      return { success: false, error: messages.common.forbidden };
    }

    const service = createServiceClient();
    const employeeResult = await service
      .from("employees")
      .select(
        `
          id, profile_id,
          profiles!inner (
            full_name, position_id, branch_id,
            positions ( label_vi ),
            branches ( name )
          )
        `,
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("id", data.employeeId)
      .eq("is_active", true)
      .eq("profiles.branch_id", data.branchId)
      .maybeSingle();

    if (employeeResult.error) {
      console.error(
        "[team/members:loadBranchEmployeeShiftTasks] employee lookup failed",
        employeeResult.error,
      );
      return {
        success: false,
        error: messages.hr.client.positionTasks.loadFailed,
      };
    }
    if (!employeeResult.data?.profiles) {
      return {
        success: false,
        error: messages.hr.client.positionTasks.errors.employee_not_found,
      };
    }

    const profile = employeeResult.data.profiles as {
      full_name: string;
      position_id: number | null;
      branch_id: number | null;
      positions: { label_vi: string | null } | null;
      branches: { name: string } | null;
    };
    const positionId = profile.position_id;
    const employee: EmployeeSummary = {
      id: employeeResult.data.id,
      profileId: employeeResult.data.profile_id,
      name: profile.full_name,
      positionId,
      positionLabel: profile.positions?.label_vi ?? null,
      branchId: profile.branch_id,
      branchName: profile.branches?.name ?? null,
    };

    const [
      tasksResult,
      defaultsResult,
      ingredientsResult,
      templateResult,
    ] = await Promise.all([
      positionId == null
        ? Promise.resolve({ data: [], error: null })
        : service
            .from("position_shift_tasks")
            .select(
              "id, position_id, title, kind, applicability, phase, is_required, allows_photo, done_definition, sort_order",
            )
            .eq("tenant_id", claims.tenant_id)
            .eq("position_id", positionId)
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),
      service
        .from("shift_checklist_consumption_default_items")
        .select("position_task_id, template_item_id, ingredient_id")
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true),
      service
        .from("ingredients")
        .select(
          "id, name, ingredient_units!ingredient_units_ingredient_tenant_fkey(is_base, units!ingredient_units_unit_tenant_fkey(code))",
        )
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true)
        .order("name", { ascending: true }),
      service
        .from("shift_checklist_templates")
        .select(
          "id, employee_id, name, shift_checklist_template_items(id, title, task_kind, scope, phase, is_required, done_definition, sort_order, is_active)",
        )
        .eq("tenant_id", claims.tenant_id)
        .eq("employee_id", data.employeeId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

    if (
      tasksResult.error ||
      defaultsResult.error ||
      ingredientsResult.error ||
      templateResult.error
    ) {
      console.error(
        "[team/members:loadBranchEmployeeShiftTasks] load failed",
        {
          tasksCode: tasksResult.error?.code,
          defaultsCode: defaultsResult.error?.code,
          ingredientsCode: ingredientsResult.error?.code,
          templateCode: templateResult.error?.code,
        },
      );
      return {
        success: false,
        error: messages.hr.client.positionTasks.loadFailed,
      };
    }

    const ingredientIdsByTask = new Map<number, number[]>();
    const ingredientIdsByTemplateItem = new Map<number, number[]>();
    for (const row of (defaultsResult.data ?? []) as ConsumptionDefaultDbRow[]) {
      if (row.position_task_id != null) {
        const existing = ingredientIdsByTask.get(row.position_task_id) ?? [];
        existing.push(row.ingredient_id);
        ingredientIdsByTask.set(row.position_task_id, existing);
      }
      if (row.template_item_id != null) {
        const existing =
          ingredientIdsByTemplateItem.get(row.template_item_id) ?? [];
        existing.push(row.ingredient_id);
        ingredientIdsByTemplateItem.set(row.template_item_id, existing);
      }
    }

    const positionTasks: PositionTaskRow[] = (
      (tasksResult.data ?? []) as PositionTaskDbRow[]
    ).map((row) => ({
      id: row.id,
      title: row.title,
      kind:
        row.kind === "consumption_report" ? "consumption_report" : "standard",
      applicability: "every_shift",
      phase: row.phase === "end_of_shift" ? "end_of_shift" : "start_of_shift",
      isRequired: row.is_required,
      allowsPhoto: row.allows_photo === true,
      doneDefinition: row.done_definition,
      sortOrder: row.sort_order,
      ingredientIds: ingredientIdsByTask.get(row.id) ?? [],
    }));

    const ingredients = (
      (ingredientsResult.data ?? []) as IngredientDbRow[]
    ).map<PositionTaskIngredientOption>((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      unit:
        ingredient.ingredient_units?.find((unit) => unit.is_base)?.units
          ?.code ?? "",
    }));

    const templateRow = templateResult.data;
    const employeeTemplates: EmployeeTaskTemplate[] =
      templateRow?.employee_id == null
        ? []
        : [
            {
              templateId: templateRow.id,
              employeeId: templateRow.employee_id,
              name: templateRow.name,
              tasks: (templateRow.shift_checklist_template_items ?? [])
                .filter((item) => item.is_active)
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((item) => ({
                  id: item.id,
                  title: item.title,
                  kind:
                    item.task_kind === "consumption_report"
                      ? "consumption_report"
                      : "standard",
                  applicability: "every_shift" as const,
                  phase:
                    item.phase === "end_of_shift"
                      ? ("end_of_shift" as const)
                      : ("start_of_shift" as const),
                  isRequired: item.is_required,
                  allowsPhoto: false,
                  doneDefinition: item.done_definition,
                  sortOrder: item.sort_order,
                  ingredientIds: ingredientIdsByTemplateItem.get(item.id) ?? [],
                })),
            },
          ];

    const payload: BranchEmployeeShiftTasksData = {
      positions: [],
      ingredients,
      tasksByPosition:
        positionId == null ? {} : { [positionId]: positionTasks },
      employees: [employee],
      employeeTemplates,
      hasOverride: employeeTemplates.length > 0,
    };

    return { success: true, data: payload };
  },
);

export const saveBranchEmployeeShiftTaskOverride = withAction(
  {
    roles: BRANCH_TASK_ROLES,
    schema: saveBranchEmployeeTasksSchema,
    permission: PERMISSION_KEYS.HR_MANAGE_EMPLOYEE_SHIFT_OVERRIDES,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    if (
      claims.user_role === "branch_manager" &&
      claims.branch_id !== data.branchId
    ) {
      return { success: false, error: messages.common.forbidden };
    }

    const service = createServiceClient();
    const employeeResult = await service
      .from("employees")
      .select("id, profiles!inner(branch_id)")
      .eq("tenant_id", claims.tenant_id)
      .eq("id", data.employeeId)
      .eq("profiles.branch_id", data.branchId)
      .maybeSingle();
    if (employeeResult.error || !employeeResult.data) {
      return {
        success: false,
        error: messages.hr.client.positionTasks.errors.employee_not_found,
      };
    }

    const { data: templateId, error } = await supabase.rpc(
      "save_employee_shift_task_override",
      { p_employee_id: data.employeeId, p_tasks: data.tasks as Json },
    );
    if (error || templateId == null) {
      return {
        success: false,
        error: mapPositionTaskError(error?.message),
      };
    }
    revalidateBranchTaskPaths(data.branchId);
    return { success: true, data: { templateId: Number(templateId) } };
  },
);

export const clearBranchEmployeeShiftTaskOverride = withAction(
  {
    roles: BRANCH_TASK_ROLES,
    schema: branchEmployeeSchema,
    permission: PERMISSION_KEYS.HR_MANAGE_EMPLOYEE_SHIFT_OVERRIDES,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    if (
      claims.user_role === "branch_manager" &&
      claims.branch_id !== data.branchId
    ) {
      return { success: false, error: messages.common.forbidden };
    }

    const service = createServiceClient();
    const employeeResult = await service
      .from("employees")
      .select("id, profiles!inner(branch_id)")
      .eq("tenant_id", claims.tenant_id)
      .eq("id", data.employeeId)
      .eq("profiles.branch_id", data.branchId)
      .maybeSingle();
    if (employeeResult.error || !employeeResult.data) {
      return {
        success: false,
        error: messages.hr.client.positionTasks.errors.employee_not_found,
      };
    }

    const { error } = await supabase.rpc("clear_employee_shift_task_override", {
      p_employee_id: data.employeeId,
    });
    if (error) {
      return {
        success: false,
        error: mapPositionTaskError(error.message),
      };
    }
    revalidateBranchTaskPaths(data.branchId);
    return { success: true };
  },
);
