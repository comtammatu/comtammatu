"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Json } from "@comtammatu/database";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  PERMISSION_KEYS,
  STAFF_ROLES,
  staffRoleFromPositionCode,
  type StaffRole,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { withAction } from "@/_lib/with-action";
import { messages } from "@lib/messages";
import {
  POSITION_TASK_APPLICABILITY,
  POSITION_TASK_KINDS,
  POSITION_TASK_PHASES,
  type PositionOption,
  type EmployeeSummary,
  type EmployeeTaskTemplate,
  type PositionTaskIngredientOption,
  type PositionTaskRow,
} from "./position-task-types";

const POSITION_TASK_ROLES: readonly StaffRole[] = STAFF_ROLES;

const taskErrors = messages.hr.client.positionTasks.errors;

const positionTaskInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  kind: z.enum(POSITION_TASK_KINDS).default("standard"),
  applicability: z.enum(POSITION_TASK_APPLICABILITY).default("every_shift"),
  phase: z.enum(POSITION_TASK_PHASES).default("start_of_shift"),
  isRequired: z.boolean().default(true),
  doneDefinition: z.string().trim().max(240).default(""),
  ingredientIds: z
    .array(z.coerce.number().int().positive())
    .max(80)
    .default([]),
});

const savePositionTasksSchema = z.object({
  positionId: z.coerce.number().int().positive(),
  tasks: z.array(positionTaskInputSchema).max(40),
});

const saveEmployeeTasksSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  tasks: z.array(positionTaskInputSchema).max(40),
});

const clearEmployeeTasksSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
});

type PositionTaskDbRow = {
  id: number;
  position_id: number;
  title: string;
  kind: string;
  applicability: string;
  phase: string;
  is_required: boolean;
  done_definition: string;
  sort_order: number;
};

type ConsumptionDefaultDbRow = {
  position_task_id: number | null;
  template_item_id: number | null;
  ingredient_id: number;
};
type PositionTaskIngredientDbRow = {
  id: number;
  name: string;
  ingredient_units?:
    { is_base: boolean; units: { code: string } | null }[] | null;
};
type EmployeeDbRow = {
  id: number;
  profile_id: string;
  profiles: {
    full_name: string;
    position_id: number | null;
    branch_id: number | null;
    positions: { label_vi: string | null } | null;
    branches: { name: string } | null;
  } | null;
};

type EmployeeTemplateDbRow = {
  id: number;
  employee_id: number;
  name: string;
  shift_checklist_template_items: Array<{
    id: number;
    title: string;
    task_kind: string;
    scope: string;
    phase: string;
    is_required: boolean;
    done_definition: string;
    sort_order: number;
    is_active: boolean;
  }>;
};

export interface PositionTasksData {
  positions: PositionOption[];
  ingredients: PositionTaskIngredientOption[];
  tasksByPosition: Record<number, PositionTaskRow[]>;
  employees: EmployeeSummary[];
  employeeTemplates: EmployeeTaskTemplate[];
}

// Map the known RPC error markers to friendly copy; never leak raw PG errors.
function mapPositionTaskError(message: string | undefined): string {
  if (!message) return messages.hr.client.positionTasks.saveFailed;
  for (const key of Object.keys(taskErrors) as (keyof typeof taskErrors)[]) {
    if (message.includes(key)) return taskErrors[key];
  }
  return messages.hr.client.positionTasks.saveFailed;
}

function revalidatePositionTaskPaths() {
  revalidatePath("/hr");
  revalidatePath("/br");
}

export async function fetchPositionTasksData(): Promise<
  ActionResult<PositionTasksData>
> {
  const ctx = await getAuthContextWithPermission(
    POSITION_TASK_ROLES,
    PERMISSION_KEYS.HR_MANAGE_POSITION_TASKS,
  );
  if (!ctx) return { success: false, error: messages.common.forbidden };

  const service = createServiceClient();
  const [
    positionsResult,
    tasksResult,
    defaultsResult,
    ingredientsResult,
    employeesResult,
    employeeTemplatesResult,
  ] = await Promise.all([
    service
      .from("positions")
      .select("id, code, label_vi")
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("is_active", true)
      .order("label_vi", { ascending: true }),
    service
      .from("position_shift_tasks")
      .select(
        "id, position_id, title, kind, applicability, phase, is_required, done_definition, sort_order",
      )
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    service
      .from("shift_checklist_consumption_default_items")
      .select("position_task_id, template_item_id, ingredient_id")
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("is_active", true),
    service
      .from("ingredients")
      .select(
        "id, name, ingredient_units!ingredient_units_ingredient_tenant_fkey(is_base, units!ingredient_units_unit_tenant_fkey(code))",
      )
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    service
      .from("employees")
      .select(
        "id, profile_id, profiles!inner(full_name, position_id, branch_id, positions(label_vi), branches(name))",
      )
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("is_active", true)
      .order("id", { ascending: true }),
    service
      .from("shift_checklist_templates")
      .select(
        "id, employee_id, name, shift_checklist_template_items(id, title, task_kind, scope, phase, is_required, done_definition, sort_order, is_active)",
      )
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("is_active", true)
      .not("employee_id", "is", null),
  ]);

  if (
    positionsResult.error ||
    tasksResult.error ||
    defaultsResult.error ||
    ingredientsResult.error ||
    employeesResult.error ||
    employeeTemplatesResult.error
  ) {
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

  const tasksByPosition: Record<number, PositionTaskRow[]> = {};
  for (const row of (tasksResult.data ?? []) as PositionTaskDbRow[]) {
    const list = tasksByPosition[row.position_id] ?? [];
    list.push({
      id: row.id,
      title: row.title,
      kind:
        row.kind === "consumption_report" ? "consumption_report" : "standard",
      applicability: "every_shift",
      phase: row.phase === "end_of_shift" ? "end_of_shift" : "start_of_shift",
      isRequired: row.is_required,
      doneDefinition: row.done_definition,
      sortOrder: row.sort_order,
      ingredientIds: ingredientIdsByTask.get(row.id) ?? [],
    });
    tasksByPosition[row.position_id] = list;
  }

  const employees = ((employeesResult.data ?? []) as EmployeeDbRow[]).flatMap(
    (employee): EmployeeSummary[] => {
      const profile = employee.profiles;
      if (!profile) return [];
      return [
        {
          id: employee.id,
          profileId: employee.profile_id,
          name: profile.full_name,
          positionId: profile.position_id,
          positionLabel: profile.positions?.label_vi ?? null,
          branchId: profile.branch_id,
          branchName: profile.branches?.name ?? null,
        },
      ];
    },
  );
  const assigneesByPosition = new Map<number, EmployeeSummary[]>();
  for (const employee of employees) {
    if (employee.positionId == null) continue;
    const list = assigneesByPosition.get(employee.positionId) ?? [];
    list.push(employee);
    assigneesByPosition.set(employee.positionId, list);
  }

  // Show every assignable position so owners can configure tasks before staff exist.
  const positions = (positionsResult.data ?? []).flatMap<PositionOption>(
    (position) => {
      const bucket = staffRoleFromPositionCode(position.code);
      if (bucket === "owner" || position.code === "archived_staff") {
        return [];
      }
      return [
        {
          id: position.id,
          code: position.code,
          label: position.label_vi ?? UNKNOWN_LABEL_VI,
          assignees: assigneesByPosition.get(position.id) ?? [],
        },
      ];
    },
  );

  const ingredients = (
    (ingredientsResult.data ?? []) as PositionTaskIngredientDbRow[]
  ).map<PositionTaskIngredientOption>((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    unit:
      ingredient.ingredient_units?.find((u) => u.is_base)?.units?.code ?? "",
  }));

  const employeeTemplates = (
    (employeeTemplatesResult.data ?? []) as EmployeeTemplateDbRow[]
  ).map<EmployeeTaskTemplate>((template) => ({
    templateId: template.id,
    employeeId: template.employee_id,
    name: template.name,
    tasks: template.shift_checklist_template_items
      .filter((item) => item.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => ({
        id: item.id,
        title: item.title,
        kind:
          item.task_kind === "consumption_report"
            ? "consumption_report"
            : "standard",
        applicability: "every_shift",
        phase:
          item.phase === "end_of_shift" ? "end_of_shift" : "start_of_shift",
        isRequired: item.is_required,
        doneDefinition: item.done_definition,
        sortOrder: item.sort_order,
        ingredientIds: ingredientIdsByTemplateItem.get(item.id) ?? [],
      })),
  }));

  return {
    success: true,
    data: {
      positions,
      ingredients,
      tasksByPosition,
      employees,
      employeeTemplates,
    },
  };
}

export const saveEmployeeShiftTaskOverride = withAction(
  {
    roles: POSITION_TASK_ROLES,
    schema: saveEmployeeTasksSchema,
    permission: PERMISSION_KEYS.HR_MANAGE_POSITION_TASKS,
  },
  async (data, { supabase }) => {
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
    revalidatePositionTaskPaths();
    return { success: true, data: { templateId: Number(templateId) } };
  },
);

export const clearEmployeeShiftTaskOverride = withAction(
  {
    roles: POSITION_TASK_ROLES,
    schema: clearEmployeeTasksSchema,
    permission: PERMISSION_KEYS.HR_MANAGE_POSITION_TASKS,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("clear_employee_shift_task_override", {
      p_employee_id: data.employeeId,
    });
    if (error) {
      return {
        success: false,
        error: mapPositionTaskError(error.message),
      };
    }
    revalidatePositionTaskPaths();
    return { success: true };
  },
);

export const savePositionTasks = withAction(
  {
    roles: POSITION_TASK_ROLES,
    schema: savePositionTasksSchema,
    permission: PERMISSION_KEYS.HR_MANAGE_POSITION_TASKS,
  },
  async (data, ctx) => {
    const service = createServiceClient();

    const { data: position } = await service
      .from("positions")
      .select("id")
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("id", data.positionId)
      .maybeSingle();
    if (!position) {
      return { success: false, error: taskErrors.position_not_found };
    }

    // Validate every referenced ingredient before the destructive RPC so a
    // bad id never leaves tasks saved with no defaults.
    const allIngredientIds = Array.from(
      new Set(data.tasks.flatMap((task) => task.ingredientIds)),
    );
    if (allIngredientIds.length > 0) {
      const { data: ingredients, error: ingredientError } = await service
        .from("ingredients")
        .select("id")
        .eq("tenant_id", ctx.claims.tenant_id)
        .eq("is_active", true)
        .in("id", allIngredientIds);
      if (
        ingredientError ||
        (ingredients ?? []).length !== allIngredientIds.length
      ) {
        return {
          success: false,
          error: messages.hr.client.positionTasks.ingredientsSaveFailed,
        };
      }
    }

    const rpcTasks = data.tasks.map((task) => ({
      title: task.title,
      kind: task.kind,
      applicability: task.applicability,
      phase: task.phase,
      isRequired: task.isRequired,
      doneDefinition: task.doneDefinition,
      ingredientIds: task.ingredientIds,
    }));

    const { error: rpcError } = await ctx.supabase.rpc(
      "upsert_position_shift_tasks",
      {
        p_position_id: data.positionId,
        p_tasks: rpcTasks as unknown as Json,
      },
    );
    if (rpcError) {
      return { success: false, error: mapPositionTaskError(rpcError.message) };
    }

    revalidatePositionTaskPaths();
    return { success: true };
  },
);
