"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Database, Json } from "@comtammatu/database";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "@/_lib/auth";
import { withAction } from "@/_lib/with-action";
import { messages } from "@lib/messages";
import {
  POSITION_TASK_APPLICABILITY,
  POSITION_TASK_KINDS,
  POSITION_TASK_PHASES,
  type PositionOption,
  type PositionTaskIngredientOption,
  type PositionTaskRow,
} from "./position-task-types";

const POSITION_TASK_ROLES: readonly StaffRole[] = ["owner"];

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

type PositionTaskDbRow = {
  id: number;
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
  ingredient_id: number;
};

type ConsumptionDefaultInsert =
  Database["public"]["Tables"]["shift_checklist_consumption_default_items"]["Insert"];

export interface PositionTasksData {
  positions: PositionOption[];
  ingredients: PositionTaskIngredientOption[];
  tasksByPosition: Record<number, PositionTaskRow[]>;
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
  const ctx = await getAuthContext(POSITION_TASK_ROLES);
  if (!ctx) return { success: false, error: messages.common.forbidden };

  const service = createServiceClient();
  const [positionsResult, tasksResult, defaultsResult, ingredientsResult] =
    await Promise.all([
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
        .select("position_task_id, ingredient_id")
        .eq("tenant_id", ctx.claims.tenant_id)
        .eq("is_active", true)
        .not("position_task_id", "is", null),
      service
        .from("ingredients")
        .select("id, name, unit, purchase_unit")
        .eq("tenant_id", ctx.claims.tenant_id)
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

  if (
    positionsResult.error ||
    tasksResult.error ||
    defaultsResult.error ||
    ingredientsResult.error
  ) {
    return {
      success: false,
      error: messages.hr.client.positionTasks.loadFailed,
    };
  }

  const ingredientIdsByTask = new Map<number, number[]>();
  for (const row of (defaultsResult.data ?? []) as ConsumptionDefaultDbRow[]) {
    if (row.position_task_id == null) continue;
    const existing = ingredientIdsByTask.get(row.position_task_id) ?? [];
    existing.push(row.ingredient_id);
    ingredientIdsByTask.set(row.position_task_id, existing);
  }

  const tasksByPosition: Record<number, PositionTaskRow[]> = {};
  for (const row of (tasksResult.data ?? []) as (PositionTaskDbRow & {
    position_id: number;
  })[]) {
    const list = tasksByPosition[row.position_id] ?? [];
    list.push({
      id: row.id,
      title: row.title,
      kind:
        row.kind === "consumption_report" ? "consumption_report" : "standard",
      applicability:
        row.applicability === "opening" || row.applicability === "closing"
          ? row.applicability
          : "every_shift",
      phase: row.phase === "end_of_shift" ? "end_of_shift" : "start_of_shift",
      isRequired: row.is_required,
      doneDefinition: row.done_definition,
      sortOrder: row.sort_order,
      ingredientIds: ingredientIdsByTask.get(row.id) ?? [],
    });
    tasksByPosition[row.position_id] = list;
  }

  const positions = (positionsResult.data ?? []).map<PositionOption>(
    (position) => ({
      id: position.id,
      code: position.code,
      label: position.label_vi ?? position.code,
    }),
  );

  const ingredients = (
    ingredientsResult.data ?? []
  ).map<PositionTaskIngredientOption>((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    unit: ingredient.purchase_unit || ingredient.unit,
  }));

  return {
    success: true,
    data: { positions, ingredients, tasksByPosition },
  };
}

export const savePositionTasks = withAction(
  {
    roles: POSITION_TASK_ROLES,
    schema: savePositionTasksSchema,
    permission: PERMISSION_KEYS.STAFF_MANAGE,
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
    }));

    const { error: rpcError } = await service.rpc(
      "upsert_position_shift_tasks",
      {
        p_position_id: data.positionId,
        p_tasks: rpcTasks as unknown as Json,
      },
    );
    if (rpcError) {
      return { success: false, error: mapPositionTaskError(rpcError.message) };
    }

    // The RPC reinserts tasks ordered by input position (sort_order 1..N);
    // re-read to recover the fresh ids, then re-key consumption defaults.
    const { data: savedTasks, error: reloadError } = await service
      .from("position_shift_tasks")
      .select("id, kind, sort_order")
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("position_id", data.positionId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (reloadError) {
      return {
        success: false,
        error: messages.hr.client.positionTasks.saveFailed,
      };
    }

    const savedIds = (savedTasks ?? []).map((task) => task.id);
    if (savedIds.length > 0) {
      const { error: clearError } = await service
        .from("shift_checklist_consumption_default_items")
        .update({ is_active: false })
        .eq("tenant_id", ctx.claims.tenant_id)
        .in("position_task_id", savedIds)
        .eq("is_active", true);
      if (clearError) {
        return {
          success: false,
          error: messages.hr.client.positionTasks.ingredientsSaveFailed,
        };
      }
    }

    const reloadedTasks = savedTasks ?? [];
    if (reloadedTasks.length !== data.tasks.length) {
      return {
        success: false,
        error: messages.hr.client.positionTasks.saveFailed,
      };
    }

    const inserts: ConsumptionDefaultInsert[] = [];
    reloadedTasks.forEach((saved, index) => {
      const input = data.tasks[index];
      if (!input || saved.kind !== "consumption_report") return;
      input.ingredientIds.forEach((ingredientId, ingredientIndex) => {
        inserts.push({
          tenant_id: ctx.claims.tenant_id,
          template_item_id: null,
          position_task_id: saved.id,
          ingredient_id: ingredientId,
          sort_order: ingredientIndex + 1,
        });
      });
    });

    if (inserts.length > 0) {
      const { error: insertError } = await service
        .from("shift_checklist_consumption_default_items")
        .insert(inserts);
      if (insertError) {
        return {
          success: false,
          error: messages.hr.client.positionTasks.ingredientsSaveFailed,
        };
      }
    }

    revalidatePositionTaskPaths();
    return { success: true };
  },
);
