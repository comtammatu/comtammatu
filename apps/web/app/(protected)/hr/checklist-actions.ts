"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Json } from "@comtammatu/database";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import {
  PERMISSION_KEYS,
  type JwtClaims,
  type StaffRole,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext, probePermission } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { withAction } from "@/_lib/with-action";
import {
  CHECKLIST_PHASES,
  type ChecklistPhase,
  type ChecklistTemplateItem,
  type ChecklistTemplateRow,
} from "./checklist-types";

const CHECKLIST_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];

const CHECKLIST_OWNER_ROLES: readonly StaffRole[] = ["owner"];

const templateItemSchema = z.object({
  title: z.string().trim().min(1).max(120),
  phase: z.enum(CHECKLIST_PHASES),
  doneDefinition: z.string().trim().max(240).default(""),
  isRequired: z.boolean().default(true),
});

const saveChecklistTemplateSchema = z.object({
  templateId: z.coerce.number().int().positive().nullable().optional(),
  branchId: z.coerce.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  items: z.array(templateItemSchema).min(1).max(40),
});

const setEmployeeDefaultChecklistSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  templateId: z.coerce.number().int().positive().nullable(),
});

const archiveChecklistTemplateSchema = z.object({
  templateId: z.coerce.number().int().positive(),
});

const applyCashierChecklistTemplateSchema = z.object({});

const CASHIER_ROLE_CODE = "cashier";
const CASHIER_CHECKLIST_TEMPLATE_NAME = "Phục vụ";

interface AppliedChecklistTemplateResult {
  updatedCount: number;
}

type ChecklistItemRow = {
  id: number;
  template_id: number;
  title: string;
  phase: string;
  done_definition: string;
  is_required: boolean;
  sort_order: number;
};

type ChecklistTemplateDbRow = {
  id: number;
  name: string;
  branch_id: number | null;
  is_active: boolean;
};

type BranchNameRow = { id: number; name: string };

function nullableRpcNumber(value: number | null | undefined): number {
  return (value ?? null) as unknown as number;
}

function revalidateChecklistPaths() {
  revalidatePath("/hr");
  revalidatePath("/employee");
  revalidatePath("/employee/tasks");
  revalidatePath("/employee/clock");
}

function normalizePhase(value: string): ChecklistPhase {
  return CHECKLIST_PHASES.includes(value as ChecklistPhase)
    ? (value as ChecklistPhase)
    : "trong_ca";
}

function normalizeTemplates(
  templates: ChecklistTemplateDbRow[],
  items: ChecklistItemRow[],
  branches: BranchNameRow[],
): ChecklistTemplateRow[] {
  const branchNameById = new Map(
    branches.map((branch) => [branch.id, branch.name]),
  );
  const itemsByTemplate = new Map<number, ChecklistTemplateItem[]>();

  for (const item of items) {
    const rows = itemsByTemplate.get(item.template_id) ?? [];
    rows.push({
      id: item.id,
      title: item.title,
      phase: normalizePhase(item.phase),
      doneDefinition: item.done_definition,
      isRequired: item.is_required,
      sortOrder: item.sort_order,
    });
    itemsByTemplate.set(item.template_id, rows);
  }

  return templates.map((template) => {
    const templateItems = (itemsByTemplate.get(template.id) ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    return {
      id: template.id,
      name: template.name,
      branchId: template.branch_id,
      branchName:
        template.branch_id == null
          ? null
          : (branchNameById.get(template.branch_id) ?? null),
      isActive: template.is_active,
      items: templateItems,
      itemCount: templateItems.length,
    };
  });
}

function visibleTemplateFilter(claims: JwtClaims) {
  return claims.user_role === "branch_manager" && claims.branch_id != null
    ? `branch_id.is.null,branch_id.eq.${claims.branch_id}`
    : null;
}

async function canManageTemplateScope(
  ctx: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>,
  branchId: number | null,
) {
  if (branchId == null) {
    return (
      ctx.claims.user_role === "owner" &&
      (await probePermission(ctx, PERMISSION_KEYS.STAFF_MANAGE))
    );
  }

  if (!(await canAccessBranch(ctx.supabase, ctx.claims, branchId))) {
    return false;
  }

  return probePermission(ctx, PERMISSION_KEYS.STAFF_MANAGE, branchId);
}

async function loadTemplateScope(
  tenantId: number,
  templateId: number,
): Promise<number | null | undefined> {
  const { data } = await createServiceClient()
    .from("shift_checklist_templates")
    .select("branch_id")
    .eq("tenant_id", tenantId)
    .eq("id", templateId)
    .maybeSingle();

  return data ? data.branch_id : undefined;
}

async function templateUsableForBranch(
  tenantId: number,
  branchId: number,
  templateId: number,
) {
  const { data } = await createServiceClient()
    .from("shift_checklist_templates")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", templateId)
    .eq("is_active", true)
    .or(`branch_id.is.null,branch_id.eq.${branchId}`)
    .maybeSingle();

  return data != null;
}

export async function fetchChecklistTemplates(): Promise<
  ActionResult<ChecklistTemplateRow[]>
> {
  const ctx = await getAuthContext(CHECKLIST_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const service = createServiceClient();
  let templateQuery = service
    .from("shift_checklist_templates")
    .select("id, name, branch_id, is_active")
    .eq("tenant_id", ctx.claims.tenant_id)
    .eq("is_active", true)
    .order("branch_id", { ascending: true, nullsFirst: true })
    .order("name", { ascending: true });

  const branchFilter = visibleTemplateFilter(ctx.claims);
  if (branchFilter) {
    templateQuery = templateQuery.or(branchFilter);
  }

  const { data: templates, error } = await templateQuery;
  if (error) {
    return { success: false, error: "Không thể tải checklist template." };
  }

  const rows = (templates ?? []) as ChecklistTemplateDbRow[];
  const templateIds = rows.map((template) => template.id);
  const branchIds = Array.from(
    new Set(
      rows
        .map((template) => template.branch_id)
        .filter((id): id is number => id != null),
    ),
  );

  const [itemsResult, branchesResult] = await Promise.all([
    templateIds.length > 0
      ? service
          .from("shift_checklist_template_items")
          .select(
            "id, template_id, title, phase, done_definition, is_required, sort_order",
          )
          .eq("tenant_id", ctx.claims.tenant_id)
          .eq("is_active", true)
          .in("template_id", templateIds)
          .order("sort_order")
      : Promise.resolve({ data: [] as ChecklistItemRow[], error: null }),
    branchIds.length > 0
      ? service
          .from("branches")
          .select("id, name")
          .eq("tenant_id", ctx.claims.tenant_id)
          .in("id", branchIds)
      : Promise.resolve({ data: [] as BranchNameRow[], error: null }),
  ]);

  if (itemsResult.error || branchesResult.error) {
    return { success: false, error: "Không thể tải chi tiết checklist." };
  }

  return {
    success: true,
    data: normalizeTemplates(
      rows,
      (itemsResult.data ?? []) as ChecklistItemRow[],
      (branchesResult.data ?? []) as BranchNameRow[],
    ),
  };
}

export const saveChecklistTemplate = withAction(
  {
    roles: CHECKLIST_ROLES,
    schema: saveChecklistTemplateSchema,
    permission: PERMISSION_KEYS.STAFF_MANAGE,
    permissionBranchId: (data) => data.branchId ?? null,
  },
  async (data, ctx) => {
    const requestedBranchId = data.branchId ?? null;
    const existingBranchId =
      data.templateId == null
        ? requestedBranchId
        : await loadTemplateScope(ctx.claims.tenant_id, data.templateId);

    if (existingBranchId === undefined) {
      return { success: false, error: "Không tìm thấy checklist template." };
    }
    if (existingBranchId !== requestedBranchId) {
      return {
        success: false,
        error: "Không thể đổi phạm vi của checklist template.",
      };
    }
    if (!(await canManageTemplateScope(ctx, requestedBranchId))) {
      return { success: false, error: "Không có quyền lưu template này." };
    }

    const payload = data.items.map((item, index) => ({
      title: item.title,
      phase: item.phase,
      doneDefinition: item.doneDefinition,
      isRequired: item.isRequired,
      sortOrder: index + 1,
    }));

    const { data: templateId, error } = await createServiceClient().rpc(
      "upsert_shift_checklist_template",
      {
        p_tenant_id: ctx.claims.tenant_id,
        p_branch_id: nullableRpcNumber(requestedBranchId),
        p_template_id: nullableRpcNumber(data.templateId),
        p_name: data.name,
        p_items: payload as unknown as Json,
      },
    );

    if (error || !templateId) {
      return { success: false, error: "Không thể lưu checklist template." };
    }

    revalidateChecklistPaths();
    return { success: true, data: { id: templateId } };
  },
);

export const setEmployeeDefaultChecklist = withAction(
  {
    roles: CHECKLIST_ROLES,
    schema: setEmployeeDefaultChecklistSchema,
    permission: PERMISSION_KEYS.STAFF_MANAGE,
  },
  async (data, ctx) => {
    const service = createServiceClient();
    const { data: employee } = await service
      .from("employees")
      .select("id, profiles!inner(branch_id)")
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("id", data.employeeId)
      .maybeSingle();

    const profile = employee?.profiles as { branch_id: number | null } | null;
    const branchId = profile?.branch_id ?? null;
    if (!employee || branchId == null) {
      return { success: false, error: "Nhân viên chưa thuộc chi nhánh hợp lệ." };
    }
    if (!(await canManageTemplateScope(ctx, branchId))) {
      return { success: false, error: "Không có quyền cập nhật nhân viên này." };
    }
    if (
      data.templateId != null &&
      !(await templateUsableForBranch(
        ctx.claims.tenant_id,
        branchId,
        data.templateId,
      ))
    ) {
      return {
        success: false,
        error: "Checklist template không thuộc phạm vi chi nhánh này.",
      };
    }

    const { error } = await service
      .from("employees")
      .update({ default_checklist_template_id: data.templateId })
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("id", data.employeeId);

    if (error) {
      return { success: false, error: "Không thể cập nhật checklist mặc định." };
    }

    revalidateChecklistPaths();
    return { success: true };
  },
);

export const applyCashierChecklistTemplate = withAction(
  {
    roles: CHECKLIST_OWNER_ROLES,
    schema: applyCashierChecklistTemplateSchema,
    permission: PERMISSION_KEYS.STAFF_MANAGE,
  },
  async (_data, { claims }) => {
    const { data: updatedCount, error } = await createServiceClient().rpc(
      "apply_checklist_template_to_role",
      {
        p_tenant_id: claims.tenant_id,
        p_role: CASHIER_ROLE_CODE,
        p_template_name: CASHIER_CHECKLIST_TEMPLATE_NAME,
      },
    );

    if (error) {
      const message =
        error.message.includes("checklist_template_not_found")
          ? "Không tìm thấy template 'Phục vụ'. Vui lòng kiểm tra seed template trước."
          : "Không thể gán template checklist cho vai trò cashier.";
      return { success: false, error: message };
    }

    const count = Number(updatedCount ?? 0);
    revalidateChecklistPaths();
    return {
      success: true,
      data: { updatedCount: count } satisfies AppliedChecklistTemplateResult,
    };
  },
);

export const archiveChecklistTemplate = withAction(
  {
    roles: CHECKLIST_ROLES,
    schema: archiveChecklistTemplateSchema,
    permission: PERMISSION_KEYS.STAFF_MANAGE,
  },
  async (data, ctx) => {
    const branchId = await loadTemplateScope(ctx.claims.tenant_id, data.templateId);
    if (branchId === undefined) {
      return { success: false, error: "Không tìm thấy checklist template." };
    }
    if (!(await canManageTemplateScope(ctx, branchId))) {
      return { success: false, error: "Không có quyền lưu template này." };
    }

    const { error } = await createServiceClient()
      .from("shift_checklist_templates")
      .update({ is_active: false })
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("id", data.templateId);

    if (error) {
      return { success: false, error: "Không thể ngưng dùng template." };
    }

    revalidateChecklistPaths();
    return { success: true };
  },
);
