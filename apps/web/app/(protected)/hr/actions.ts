"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  PERMISSION_KEYS,
  STAFF_ROLES,
  requiredBranchKindForPositionCode,
  staffRoleFromPositionCode,
  type StaffRole,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  getVNDateString,
  getVNMonthEndDateString,
} from "@comtammatu/shared/time";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { countCompletedShiftWorkdays } from "@lib/staff-runtime/_lib/workday-math";
import { messages } from "@lib/messages";
import {
  getAuthContext,
  getAuthContextWithPermission,
  probePermission,
} from "@/_lib/auth";
import { withAction } from "@/_lib/with-action";
import { logAudit } from "@/_lib/audit";
import { calculateAttendanceWorkHours } from "./attendance-summary";
import { getHrScopeBranchId, resolveHrBranchScope } from "@/lib/hr-scope";

const HR_ROLES: readonly StaffRole[] = STAFF_ROLES;
const HR_EMPLOYEE_VIEW_ROLES: readonly StaffRole[] = STAFF_ROLES;
const SHIFT_ROLES: readonly StaffRole[] = STAFF_ROLES;
const ATTENDANCE_PHOTO_BUCKET = "attendance-photos";
const ATTENDANCE_PHOTO_SIGNED_URL_TTL_SECONDS = 300;
const CONTRACT_TYPES = ["probation", "fixed_term", "indefinite"] as const;
const PAY_BASIS_VALUES = ["attendance_prorated", "fixed_monthly"] as const;
const hrActionCopy = messages.hr.actions;

/* ─── Employees ─── */

const createEmployeeAccountSchema = z.object({
  fullName: z.string().trim().min(1, { error: "Họ tên không được để trống" }),
  email: z.string().email({ error: "Email không hợp lệ" }),
  password: z.string().min(8, { error: "Mật khẩu phải có ít nhất 8 ký tự" }),
  phone: z.string().trim().optional(),
  positionCode: z.string().min(1, { error: "Chọn chức vụ" }),
  branchId: z.coerce.number().int().positive().optional(),
  employeeCode: z.string().trim().optional(),
  startDate: z.string().optional(),
  contractType: z.enum(CONTRACT_TYPES).nullable().optional(),
  defaultChecklistTemplateId: z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),
  baseSalary: z.coerce.number().int().nonnegative().optional(),
  insuranceBaseSalary: z.coerce.number().int().nonnegative().optional(),
  dependentsCount: z.coerce.number().int().min(0).max(20).default(0),
  contractNumber: z.string().trim().optional(),
  contractSignedDate: z.string().optional(),
  contractEndDate: z.string().optional(),
  idNumber: z.string().trim().optional(),
  bankAccount: z.string().trim().optional(),
  payBasis: z.enum(PAY_BASIS_VALUES).optional(),
});

const updateEmployeeSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  fullName: z
    .string()
    .trim()
    .min(1, { error: "Họ tên không được để trống" })
    .optional(),
  phone: z.string().trim().optional(),
  positionCode: z.string().optional(),
  branchId: z.coerce.number().int().positive().nullable().optional(),
  employeeCode: z.string().trim().optional(),
  startDate: z.string().optional(),
  contractType: z.enum(CONTRACT_TYPES).nullable().optional(),
  defaultChecklistTemplateId: z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),
  baseSalary: z.coerce.number().int().nonnegative().optional(),
  insuranceBaseSalary: z.coerce.number().int().nonnegative().optional(),
  dependentsCount: z.coerce.number().int().min(0).max(20).optional(),
  contractNumber: z.string().trim().optional(),
  contractSignedDate: z.string().optional(),
  contractEndDate: z.string().optional(),
  idNumber: z.string().trim().optional(),
  bankAccount: z.string().trim().optional(),
  payBasis: z.enum(PAY_BASIS_VALUES).optional(),
  isActive: z.boolean().optional(),
});

type ServiceClient = ReturnType<typeof createServiceClient>;

interface ContractPayload {
  tenantId: number;
  employeeId: number;
  contractType: (typeof CONTRACT_TYPES)[number] | null | undefined;
  contractNumber: string | undefined;
  signedDate: string | undefined;
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  grossSalary: number | null | undefined;
  insuranceBaseSalary: number | undefined;
  position: string | null | undefined;
  workLocation: string | null | undefined;
  payBasis?: (typeof PAY_BASIS_VALUES)[number];
}

async function upsertActiveContract(
  service: ServiceClient,
  payload: ContractPayload,
): Promise<ActionResult> {
  if (!payload.contractNumber) return { success: true };
  if (!payload.contractType) {
    return { success: false, error: "Chọn loại hợp đồng trước khi lưu HĐLĐ." };
  }
  if (!payload.startDate) {
    return { success: false, error: "Nhập ngày bắt đầu trước khi lưu HĐLĐ." };
  }

  const { data: existing } = await service
    .from("employment_contracts")
    .select("id")
    .eq("tenant_id", payload.tenantId)
    .eq("employee_id", payload.employeeId)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const contractRow = {
    tenant_id: payload.tenantId,
    employee_id: payload.employeeId,
    contract_type: payload.contractType,
    contract_number: payload.contractNumber,
    signed_date: payload.signedDate || payload.startDate || getVNDateString(),
    start_date: payload.startDate,
    end_date: payload.endDate || null,
    gross_salary: payload.grossSalary ?? 0,
    insurance_base_salary: payload.insuranceBaseSalary ?? 0,
    position: payload.position || "Nhân viên",
    work_location: payload.workLocation || null,
    status: "active",
    // Column lands with universal HR migration; cast until db:types.
    pay_basis: payload.payBasis ?? "attendance_prorated",
  };

  const query = existing
    ? service
        .from("employment_contracts")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pay_basis ahead of generated types
        .update(contractRow as any)
        .eq("id", existing.id)
        .eq("tenant_id", payload.tenantId)
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pay_basis ahead of generated types
      service.from("employment_contracts").insert(contractRow as any);

  const { error } = await query;
  if (error) {
    console.error(
      "[hr/actions:upsertActiveContract] Upsert contract error:",
      error,
    );
    if (error.code === "23505") {
      return { success: false, error: "Số hợp đồng đã tồn tại." };
    }
    return { success: false, error: "Không thể lưu hợp đồng lao động." };
  }

  await service.rpc("sync_insurance_base", {
    p_employee_id: payload.employeeId,
  });

  return { success: true };
}

async function loadChecklistTemplateBranch(
  tenantId: number,
  templateId: number,
): Promise<number | null | undefined> {
  const { data } = await createServiceClient()
    .from("shift_checklist_templates")
    .select("branch_id")
    .eq("tenant_id", tenantId)
    .eq("id", templateId)
    .eq("is_active", true)
    .maybeSingle();

  return data?.branch_id;
}

// Owner-only personnel/payroll fields stay out of branch_manager payloads, not
// only out of the rendered table.
const EMPLOYEE_SELECT_OWNER = `
      id, employee_code, id_number, bank_account, bank_name,
      base_salary, insurance_base_salary, start_date, contract_type, dependents_count, is_active,
      default_checklist_template_id,
      employment_contracts (
        id, contract_number, signed_date, start_date, end_date,
        gross_salary, insurance_base_salary, status
      ),
      profiles!inner (
        id, full_name, phone, branch_id,
        positions ( code, label_vi, default_checklist_template_id ),
        branches ( name )
      )
    `;

const EMPLOYEE_SELECT_BRANCH_MANAGER = `
      id, employee_code, is_active,
      profiles!inner (
        full_name, branch_id,
        positions ( code, label_vi ),
        branches ( name )
      )
    `;

export async function fetchEmployees(
  branchScope?: string,
): Promise<ActionResult> {
  const baseCtx = await getAuthContext(HR_EMPLOYEE_VIEW_ROLES);
  if (!baseCtx) return { success: false, error: "Không có quyền" };

  const { claims, user } = baseCtx;
  const isBranchManager = claims.user_role === "branch_manager";
  const canViewEmployeesWithPermission =
    isBranchManager ||
    (
      await Promise.all([
        probePermission(baseCtx, PERMISSION_KEYS.STAFF_MANAGE),
        probePermission(baseCtx, PERMISSION_KEYS.HR_VIEW_EMPLOYEE),
      ])
    ).some(Boolean);
  if (!canViewEmployeesWithPermission) {
    return { success: false, error: "Không có quyền" };
  }

  let branchManagerBranchId = claims.branch_id;
  if (isBranchManager && branchManagerBranchId == null) {
    const { data: profileBranch } = await baseCtx.supabase
      .from("profiles")
      .select("branch_id")
      .eq("id", user.id)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();
    branchManagerBranchId = profileBranch?.branch_id ?? null;
  }

  // Employee rows contain Owner-only payroll and identity fields, so the
  // Branch Manager projection stays limited and exact-branch here.
  const employeeClient = isBranchManager
    ? createServiceClient()
    : baseCtx.supabase;

  let query = employeeClient
    .from("employees")
    .select(
      isBranchManager ? EMPLOYEE_SELECT_BRANCH_MANAGER : EMPLOYEE_SELECT_OWNER,
    )
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (isBranchManager) {
    if (branchManagerBranchId == null) {
      return { success: true, data: [] };
    }
    query = query.eq("profiles.branch_id", branchManagerBranchId);
  } else {
    const normalizedScope = resolveHrBranchScope(branchScope);
    const requestedBranchId = getHrScopeBranchId(normalizedScope);
    if (normalizedScope === "office") {
      query = query.is("profiles.branch_id", null);
    } else if (requestedBranchId != null) {
      const { data: branch } = await baseCtx.supabase
        .from("branches")
        .select("id")
        .eq("tenant_id", claims.tenant_id)
        .eq("id", requestedBranchId)
        .maybeSingle();
      if (!branch) return { success: true, data: [] };
      query = query.eq("profiles.branch_id", branch.id);
    }
  }

  const { data, error } = await query;

  if (error) {
    console.error("[hr/actions:fetchEmployees] Fetch employees error:", error);
    return { success: false, error: hrActionCopy.fetchEmployeesFailed };
  }

  return { success: true, data: data ?? [] };
}

// One-step onboarding: create the login account (profile auto-created by the
// `handle_new_user` trigger) AND the employee record in one submit. The auth
// user is created via the Auth Admin API, which cannot share a Postgres
// transaction with the employee INSERT, so a post-create failure is rolled back
// by deleting the orphan auth user (cascades to the profile via FK).
export const createEmployeeAccount = withAction(
  {
    roles: HR_ROLES,
    schema: createEmployeeAccountSchema,
    permission: PERMISSION_KEYS.HR_MANAGE_EMPLOYEE,
  },
  async (data, { claims, supabase, user }) => {
    const role = staffRoleFromPositionCode(data.positionCode);
    if (role === "owner") {
      return {
        success: false,
        error: "Chức vụ không hợp lệ.",
      };
    }
    if (
      role !== "unassigned" &&
      !(STAFF_ROLES as readonly string[]).includes(role)
    ) {
      return { success: false, error: "Vai trò không hợp lệ." };
    }
    const effectiveBranchId = data.branchId;

    const { data: position } = await supabase
      .from("positions")
      .select("id")
      .eq("tenant_id", claims.tenant_id)
      .eq("code", data.positionCode)
      .eq("is_active", true)
      .maybeSingle();
    if (!position) {
      return { success: false, error: "Chức vụ không hợp lệ." };
    }

    const requiredBranchKind = requiredBranchKindForPositionCode(
      data.positionCode,
    );
    if (requiredBranchKind === "unassigned" && effectiveBranchId) {
      return {
        success: false,
        error: "Chức vụ toàn công ty không thuộc địa điểm.",
      };
    }
    if (
      requiredBranchKind !== null &&
      requiredBranchKind !== "unassigned" &&
      !effectiveBranchId
    ) {
      return {
        success: false,
        error: "Chức vụ vận hành phải thuộc một địa điểm.",
      };
    }

    const service = createServiceClient();
    let branchName: string | null = null;

    if (effectiveBranchId != null) {
      const { data: branch } = await service
        .from("branches")
        .select("branch_kind, name")
        .eq("id", effectiveBranchId)
        .eq("tenant_id", claims.tenant_id)
        .maybeSingle();
      if (!branch) {
        return { success: false, error: "Chi nhánh không hợp lệ." };
      }
      if (
        requiredBranchKind !== null &&
        branch.branch_kind !== requiredBranchKind
      ) {
        return {
          success: false,
          error: "Chức vụ này không thuộc loại địa điểm đã chọn.",
        };
      }
      branchName = branch.name ?? null;
    }

    if (data.defaultChecklistTemplateId != null) {
      const templateBranchId = await loadChecklistTemplateBranch(
        claims.tenant_id,
        data.defaultChecklistTemplateId,
      );
      if (templateBranchId === undefined) {
        return {
          success: false,
          error: "Mẫu việc trong ca không tồn tại hoặc đã ngưng sử dụng.",
        };
      }
      if (
        templateBranchId != null &&
        templateBranchId !== (effectiveBranchId ?? null)
      ) {
        return {
          success: false,
          error: "Mẫu việc trong ca không thuộc phạm vi chi nhánh này.",
        };
      }
    }

    const { data: created, error: authError } =
      await service.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        app_metadata: {
          tenant_id: claims.tenant_id,
          branch_id: effectiveBranchId ?? null,
          position_code: data.positionCode,
          full_name: data.fullName,
          provisioned_by: user.id,
        },
        user_metadata: { full_name: data.fullName },
      });

    if (authError || !created?.user) {
      if (authError) {
        console.error(
          "[hr/actions:createEmployeeAccount] Auth createUser error:",
          authError,
        );
      }
      if (
        authError?.message?.includes("already been registered") ||
        authError?.message?.includes("already exists")
      ) {
        return { success: false, error: "Email này đã được sử dụng." };
      }
      return {
        success: false,
        error: "Không thể tạo tài khoản. Vui lòng thử lại.",
      };
    }

    const userId = created.user.id;

    if (data.phone) {
      const { error: phoneError } = await service
        .from("profiles")
        .update({ phone: data.phone })
        .eq("id", userId)
        .eq("tenant_id", claims.tenant_id);
      if (phoneError) {
        console.error(
          "[hr/actions:createEmployeeAccount] Save phone error (cleanup user):",
          phoneError,
        );
        await service.auth.admin.deleteUser(userId);
        return { success: false, error: "Không thể lưu số điện thoại." };
      }
    }

    const { data: result, error } = await service
      .from("employees")
      .insert({
        tenant_id: claims.tenant_id,
        profile_id: userId,
        employee_code: data.employeeCode ?? null,
        start_date: data.startDate ?? null,
        contract_type: data.contractType ?? null,
        dependents_count: data.dependentsCount,
        // Sensitive employee fields are protected by the dedicated HR capability.
        base_salary: data.baseSalary ?? null,
        insurance_base_salary: data.insuranceBaseSalary ?? 0,
        id_number: data.idNumber ?? null,
        bank_account: data.bankAccount ?? null,
        default_checklist_template_id: data.defaultChecklistTemplateId ?? null,
      })
      .select("id")
      .single();

    if (error || !result) {
      if (error) {
        console.error(
          "[hr/actions:createEmployeeAccount] Insert employee error (cleanup user):",
          error,
        );
      }
      await service.auth.admin.deleteUser(userId);
      if (error?.code === "23505") {
        return { success: false, error: "Mã nhân viên đã tồn tại." };
      }
      return { success: false, error: "Không thể tạo hồ sơ nhân viên." };
    }

    const contractResult = await upsertActiveContract(service, {
      tenantId: claims.tenant_id,
      employeeId: result.id,
      contractType: data.contractType,
      contractNumber: data.contractNumber,
      signedDate: data.contractSignedDate,
      startDate: data.startDate ?? null,
      endDate: data.contractEndDate ?? null,
      grossSalary: data.baseSalary ?? null,
      insuranceBaseSalary: data.insuranceBaseSalary,
      position: data.positionCode,
      workLocation: branchName,
      payBasis: data.payBasis,
    });
    if (!contractResult.success) {
      await service.auth.admin.deleteUser(userId);
      return contractResult;
    }

    logAudit(supabase, {
      action: "create",
      entityType: "employee",
      entityId: result.id,
      newData: {
        base_salary: data.baseSalary ?? null,
        insurance_base_salary: data.insuranceBaseSalary ?? 0,
        contract_type: data.contractType ?? null,
        contract_number: data.contractNumber ?? null,
        dependents_count: data.dependentsCount,
        pay_basis: data.payBasis ?? "attendance_prorated",
      },
    });

    revalidateHrPaths();
    return { success: true, data: result };
  },
);

// Helper to map DB RPC errors to user-friendly messages
function mapRpcError(msg: string): string {
  if (msg.includes("target profile not found"))
    return "Nhân viên không tồn tại";
  if (msg.includes("cannot modify owner"))
    return "Không có quyền chỉnh sửa chủ sở hữu";
  if (msg.includes("cannot set role above"))
    return "Không có quyền gán vai trò cao hơn";
  if (msg.includes("target not in your branch"))
    return "Nhân viên không thuộc chi nhánh của bạn";
  if (msg.includes("cannot modify peer"))
    return "Không có quyền chỉnh sửa quản lý cùng cấp";
  if (msg.includes("can only assign"))
    return "Bạn chỉ có thể gán vai trò thu ngân/bếp";
  if (msg.includes("cannot reassign to other branch"))
    return "Không có quyền chuyển nhân viên sang chi nhánh khác";
  if (
    msg.includes("operational roles require branch_id") ||
    msg.includes("branch_required_for_operational_position")
  )
    return "Chức vụ vận hành phải thuộc một địa điểm";
  if (
    msg.includes("branch_id does not belong") ||
    msg.includes("branch_not_found_in_tenant")
  )
    return "Chi nhánh không hợp lệ";
  if (msg.includes("position_site_kind_mismatch"))
    return "Chức vụ này không thuộc loại địa điểm đã chọn.";
  if (msg.includes("insufficient privileges"))
    return "Không có quyền quản lý nhân viên";
  return "Không thể cập nhật. Vui lòng thử lại.";
}

// Edit an existing employee's profile + employment record.
// Sensitive fields require the tenant-scoped HR management capability.
// Partial update: only provided fields are written.
export const updateEmployee = withAction(
  {
    roles: HR_ROLES,
    schema: updateEmployeeSchema,
    permission: PERMISSION_KEYS.HR_MANAGE_EMPLOYEE,
  },
  async (data, { claims, supabase }) => {
    const service = createServiceClient();

    const { data: employee, error: loadError } = await service
      .from("employees")
      .select(
        `
        id, profile_id, is_active,
        profiles!inner (
          id, branch_id, full_name, phone,
          positions ( code, label_vi ),
          branches ( name )
        )
      `,
      )
      .eq("id", data.employeeId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();

    if (loadError || !employee) {
      if (loadError) {
        console.error(
          "[hr/actions:updateEmployee] Load employee error:",
          loadError,
        );
      }
      return { success: false, error: "Không tìm thấy hồ sơ nhân viên." };
    }

    const employeeBranchId = employee.profiles?.branch_id ?? null;
    const finalBranchId =
      data.branchId !== undefined ? data.branchId : employeeBranchId;

    if (data.defaultChecklistTemplateId != null) {
      const templateBranchId = await loadChecklistTemplateBranch(
        claims.tenant_id,
        data.defaultChecklistTemplateId,
      );
      if (templateBranchId === undefined) {
        return {
          success: false,
          error: "Mẫu việc trong ca không tồn tại hoặc đã ngưng sử dụng.",
        };
      }
      if (templateBranchId != null && templateBranchId !== finalBranchId) {
        return {
          success: false,
          error: "Mẫu việc trong ca không thuộc phạm vi chi nhánh này.",
        };
      }
    }

    const isProfileModified =
      data.fullName !== undefined ||
      data.phone !== undefined ||
      data.positionCode !== undefined ||
      data.branchId !== undefined ||
      data.isActive !== undefined;

    if (isProfileModified) {
      const currentPositionCode = employee.profiles?.positions?.code ?? null;
      const finalPositionCode =
        data.positionCode !== undefined
          ? data.positionCode
          : currentPositionCode;

      const targetBranchId =
        data.branchId !== undefined
          ? (data.branchId ?? undefined)
          : (employee.profiles?.branch_id ?? undefined);

      const { error: profileError } = await supabase.rpc(
        "update_staff_profile",
        {
          p_target_id: employee.profile_id,
          p_full_name:
            data.fullName !== undefined
              ? data.fullName
              : (employee.profiles?.full_name ?? undefined),
          p_phone:
            data.phone !== undefined
              ? data.phone || undefined
              : (employee.profiles?.phone ?? undefined),
          p_position_code: finalPositionCode ?? undefined,
          p_branch_id: targetBranchId,
          p_is_active:
            data.isActive !== undefined
              ? data.isActive
              : (employee.is_active ?? undefined),
        },
      );

      if (profileError) {
        console.error(
          "[hr/actions:updateEmployee] Update profile via RPC error:",
          profileError,
        );
        return { success: false, error: mapRpcError(profileError.message) };
      }
    }

    const employeeUpdate: {
      employee_code?: string | null;
      start_date?: string | null;
      contract_type?: string | null;
      dependents_count?: number;
      base_salary?: number | null;
      insurance_base_salary?: number;
      id_number?: string | null;
      bank_account?: string | null;
      default_checklist_template_id?: number | null;
      is_active?: boolean;
    } = {};
    if (data.employeeCode !== undefined) {
      employeeUpdate.employee_code = data.employeeCode || null;
    }
    if (data.startDate !== undefined) {
      employeeUpdate.start_date = data.startDate || null;
    }
    if (data.contractType !== undefined) {
      employeeUpdate.contract_type = data.contractType ?? null;
    }
    if (data.dependentsCount !== undefined) {
      employeeUpdate.dependents_count = data.dependentsCount;
    }
    if (data.baseSalary !== undefined) {
      employeeUpdate.base_salary = data.baseSalary;
    }
    if (data.insuranceBaseSalary !== undefined) {
      employeeUpdate.insurance_base_salary = data.insuranceBaseSalary;
    }
    if (data.idNumber !== undefined) {
      employeeUpdate.id_number = data.idNumber || null;
    }
    if (data.bankAccount !== undefined) {
      employeeUpdate.bank_account = data.bankAccount || null;
    }
    if (data.defaultChecklistTemplateId !== undefined) {
      employeeUpdate.default_checklist_template_id =
        data.defaultChecklistTemplateId;
    }
    if (data.isActive !== undefined) {
      employeeUpdate.is_active = data.isActive;
    }

    if (Object.keys(employeeUpdate).length > 0) {
      const { error: employeeError } = await service
        .from("employees")
        .update(employeeUpdate)
        .eq("id", data.employeeId)
        .eq("tenant_id", claims.tenant_id);
      if (employeeError) {
        console.error(
          "[hr/actions:updateEmployee] Update employee error:",
          employeeError,
        );
        if (employeeError.code === "23505") {
          return { success: false, error: "Mã nhân viên đã tồn tại." };
        }
        return { success: false, error: "Không thể cập nhật hồ sơ nhân viên." };
      }
    }

    const contractResult = await upsertActiveContract(service, {
      tenantId: claims.tenant_id,
      employeeId: data.employeeId,
      contractType: data.contractType,
      contractNumber: data.contractNumber,
      signedDate: data.contractSignedDate,
      startDate: data.startDate ?? null,
      endDate: data.contractEndDate ?? null,
      grossSalary: data.baseSalary,
      insuranceBaseSalary: data.insuranceBaseSalary,
      position:
        employee.profiles?.positions?.label_vi ??
        employee.profiles?.positions?.code ??
        null,
      workLocation: employee.profiles?.branches?.name ?? null,
      payBasis: data.payBasis,
    });
    if (!contractResult.success) return contractResult;

    logAudit(supabase, {
      action: "update",
      entityType: "employee",
      entityId: data.employeeId,
      newData: {
        ...(data.baseSalary !== undefined
          ? { base_salary: data.baseSalary }
          : {}),
        ...(data.insuranceBaseSalary !== undefined
          ? { insurance_base_salary: data.insuranceBaseSalary }
          : {}),
        ...(data.contractType !== undefined
          ? { contract_type: data.contractType ?? null }
          : {}),
        ...(data.contractNumber !== undefined
          ? { contract_number: data.contractNumber || null }
          : {}),
        ...(data.dependentsCount !== undefined
          ? { dependents_count: data.dependentsCount }
          : {}),
        ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
      },
    });

    revalidateHrPaths();
    return { success: true, data: { id: data.employeeId } };
  },
);

/* ─── Shifts (global config — D027) ─── */

const shiftSchema = z.object({
  name: z.string().min(1, { error: "Tên ca không được để trống" }),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, { error: "Giờ bắt đầu không hợp lệ (HH:MM)" }),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, { error: "Giờ kết thúc không hợp lệ (HH:MM)" }),
});

const updateShiftSchema = shiftSchema.extend({
  shiftId: z.coerce.number().int().positive(),
  isActive: z.boolean().optional(),
});

const deactivateShiftSchema = z.object({
  shiftId: z.coerce.number().int().positive(),
});

const SHIFT_SELECT =
  "id, name, start_time, end_time, is_active, is_opening, is_closing";

function revalidateHrPaths() {
  revalidatePath("/hr");
  revalidatePath("/br");
}

// Shifts are global (branch_id NULL): one set shared across every branch.
// Service client read/write, gated by role at the action layer — RLS is
// branch-scoped and would not match null-branch rows.
export async function fetchShifts(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    HR_ROLES,
    PERMISSION_KEYS.HR_MANAGE_SHIFT_CATALOG,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { data, error } = await createServiceClient()
    .from("shifts")
    .select(SHIFT_SELECT)
    .is("branch_id", null)
    .eq("tenant_id", ctx.claims.tenant_id)
    .order("start_time");

  if (error) {
    console.error("[hr/actions:fetchShifts] Fetch shifts error:", error);
    return { success: false, error: hrActionCopy.fetchShiftsFailed };
  }

  return { success: true, data: data ?? [] };
}

export const createShift = withAction(
  {
    roles: HR_ROLES,
    schema: shiftSchema,
    permission: PERMISSION_KEYS.HR_MANAGE_SHIFT_CATALOG,
  },
  async (data, { claims }) => {
    const { data: result, error } = await createServiceClient()
      .from("shifts")
      .insert({
        tenant_id: claims.tenant_id,
        branch_id: null,
        name: data.name,
        start_time: data.startTime,
        end_time: data.endTime,
      })
      .select(SHIFT_SELECT)
      .single();

    if (error) {
      console.error("[hr/actions:createShift] Insert shift error:", error);
      if (error.code === "23505") {
        return { success: false, error: "Ca này đã tồn tại." };
      }
      return { success: false, error: "Không thể tạo ca." };
    }

    revalidateHrPaths();
    return { success: true, data: result };
  },
);

export const updateShift = withAction(
  {
    roles: HR_ROLES,
    schema: updateShiftSchema,
    permission: PERMISSION_KEYS.HR_MANAGE_SHIFT_CATALOG,
  },
  async (data, { claims }) => {
    const { data: result, error } = await createServiceClient()
      .from("shifts")
      .update({
        name: data.name,
        start_time: data.startTime,
        end_time: data.endTime,
        is_active: data.isActive ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.shiftId)
      .eq("tenant_id", claims.tenant_id)
      .is("branch_id", null)
      .select(SHIFT_SELECT)
      .maybeSingle();

    if (error || !result) {
      if (error) {
        console.error("[hr/actions:updateShift] Update shift error:", error);
      }
      return { success: false, error: "Không thể cập nhật ca." };
    }

    revalidateHrPaths();
    return { success: true, data: result };
  },
);

export const deactivateShift = withAction(
  {
    roles: HR_ROLES,
    schema: deactivateShiftSchema,
    permission: PERMISSION_KEYS.HR_MANAGE_SHIFT_CATALOG,
  },
  async (data, { claims }) => {
    const { data: result, error } = await createServiceClient()
      .from("shifts")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.shiftId)
      .eq("tenant_id", claims.tenant_id)
      .is("branch_id", null)
      .select(SHIFT_SELECT)
      .maybeSingle();

    if (error || !result) {
      if (error) {
        console.error(
          "[hr/actions:deactivateShift] Deactivate shift error:",
          error,
        );
      }
      if (error?.message.includes("shift_used_by_weekly_schedule")) {
        return {
          success: false,
          error:
            "Ca đang được dùng trong lịch cố định. Hãy đổi lịch trước khi ngưng dùng ca.",
        };
      }
      return { success: false, error: "Không thể ngưng dùng ca." };
    }

    revalidateHrPaths();
    return { success: true, data: result };
  },
);

/* ─── Attendance ─── */

const fetchAttendanceSchema = z.object({
  branchId: z.coerce.number().int().positive().nullable().optional(),
  officeOnly: z.boolean().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  /** When set, return only that VN business date (Today tab). */
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const attendancePhotoSchema = z.object({
  attendanceId: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive(),
});

export interface AttendanceCalendarEmployee {
  id: number;
  employee_code: string;
  full_name: string;
}

export interface AttendanceCalendarLeave {
  employee_id: number;
  start_date: string;
  end_date: string;
  status: "pending" | "approved";
}

export const fetchAttendance = withAction(
  {
    roles: SHIFT_ROLES,
    schema: fetchAttendanceSchema,
    permission: PERMISSION_KEYS.HR_VIEW_EMPLOYEE,
    permissionBranchId: (data) => data.branchId ?? null,
  },
  async (data, { supabase, claims }) => {
    if (
      claims.user_role === "branch_manager" &&
      (data.branchId == null || claims.branch_id !== data.branchId)
    ) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const startDate = `${data.month}-01`;
    const [year, mon] = data.month.split("-").map(Number);
    const endDate = getVNMonthEndDateString(year!, mon!);
    const day =
      data.day && data.day.startsWith(`${data.month}-`) ? data.day : null;

    const attendanceClient =
      claims.user_role === "branch_manager" ? createServiceClient() : supabase;

    let query = attendanceClient
      .from("attendance_records")
      .select(
        `
      id, branch_id, date, check_in, check_out, status, note, check_in_photo_path,
      checklist_template_id,
      employee_id,
      employees (
        id, employee_code,
        profiles ( full_name )
      ),
      shifts ( name, start_time, end_time ),
      shift_checklist_templates ( name ),
      attendance_checklist_items (
        id, title, phase, done_definition, is_required, is_done, sort_order
      )
    `,
      )
      .eq("tenant_id", claims.tenant_id)
      .order("date")
      .order("employee_id");
    if (day) {
      query = query.eq("date", day);
    } else {
      query = query.gte("date", startDate).lte("date", endDate!);
    }
    if (data.branchId != null) query = query.eq("branch_id", data.branchId);
    else if (data.officeOnly) query = query.is("branch_id", null);
    const { data: result, error } = await query;

    if (error) {
      console.error(
        "[hr/actions:fetchAttendance] Fetch attendance records error:",
        error,
      );
      return { success: false, error: hrActionCopy.fetchAttendanceFailed };
    }

    return { success: true, data: result ?? [] };
  },
);

export const fetchAttendanceCalendar = withAction(
  {
    roles: SHIFT_ROLES,
    schema: fetchAttendanceSchema,
    permission: PERMISSION_KEYS.HR_VIEW_EMPLOYEE,
    permissionBranchId: (data) => data.branchId ?? null,
  },
  async (data, { supabase, claims }) => {
    if (
      claims.user_role === "branch_manager" &&
      (data.branchId == null || claims.branch_id !== data.branchId)
    ) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const startDate = `${data.month}-01`;
    const [year, mon] = data.month.split("-").map(Number);
    const endDate = getVNMonthEndDateString(year!, mon!);
    const calendarClient =
      claims.user_role === "branch_manager" ? createServiceClient() : supabase;

    let attendanceQuery = calendarClient
      .from("attendance_records")
      .select(
        `
        id, branch_id, date, check_in, check_out, status, note, check_in_photo_path,
        checklist_template_id,
        employee_id,
        employees (
          id, employee_code,
          profiles ( full_name )
        ),
        shifts ( name, start_time, end_time ),
        shift_checklist_templates ( name ),
        attendance_checklist_items (
          id, title, phase, done_definition, is_required, is_done, sort_order
        )
      `,
      )
      .eq("tenant_id", claims.tenant_id)
      .gte("date", startDate)
      .lte("date", endDate!)
      .order("date")
      .order("employee_id");
    let employeesQuery = calendarClient
      .from("employees")
      .select("id, employee_code, profiles!inner ( full_name, branch_id )")
      .eq("tenant_id", claims.tenant_id)
      .order("employee_code");
    let leavesQuery = calendarClient
      .from("leave_requests")
      .select("employee_id, start_date, end_date, status")
      .eq("tenant_id", claims.tenant_id)
      .in("status", ["pending", "approved"])
      .lte("start_date", endDate!)
      .gte("end_date", startDate)
      .order("start_date");
    if (data.branchId != null) {
      attendanceQuery = attendanceQuery.eq("branch_id", data.branchId);
      employeesQuery = employeesQuery.eq("profiles.branch_id", data.branchId);
      leavesQuery = leavesQuery.eq("branch_id", data.branchId);
    } else if (data.officeOnly) {
      attendanceQuery = attendanceQuery.is("branch_id", null);
      employeesQuery = employeesQuery.is("profiles.branch_id", null);
      leavesQuery = leavesQuery.is("branch_id", null);
    }
    const [attendanceResult, employeesResult, leavesResult] = await Promise.all(
      [attendanceQuery, employeesQuery, leavesQuery],
    );

    if (attendanceResult.error || employeesResult.error || leavesResult.error) {
      console.error(
        "[hr/actions:fetchAttendanceCalendar] Fetch attendance calendar error:",
        attendanceResult.error ?? employeesResult.error ?? leavesResult.error,
      );
      return { success: false, error: hrActionCopy.fetchAttendanceFailed };
    }

    const employees: AttendanceCalendarEmployee[] = (
      employeesResult.data ?? []
    ).map((employee) => {
      const profile = employee.profiles as {
        full_name: string;
      } | null;
      return {
        id: employee.id,
        employee_code: employee.employee_code ?? "",
        full_name: profile?.full_name ?? "",
      };
    });
    const leaves: AttendanceCalendarLeave[] = (leavesResult.data ?? []).flatMap(
      (leave) =>
        leave.status === "pending" || leave.status === "approved"
          ? [
              {
                employee_id: leave.employee_id,
                start_date: leave.start_date,
                end_date: leave.end_date,
                status: leave.status,
              },
            ]
          : [],
    );

    return {
      success: true,
      data: {
        attendance: attendanceResult.data ?? [],
        employees,
        leaves,
      },
    };
  },
);

export const getAttendancePhotoUrl = withAction(
  {
    roles: SHIFT_ROLES,
    schema: attendancePhotoSchema,
    permission: PERMISSION_KEYS.HR_VIEW_EMPLOYEE,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    let query = supabase
      .from("attendance_records")
      .select("id, branch_id, check_in_photo_path")
      .eq("id", data.attendanceId)
      .eq("branch_id", data.branchId)
      .eq("tenant_id", claims.tenant_id);

    if (claims.user_role === "branch_manager") {
      if (claims.branch_id == null) {
        return { success: false, error: "Tài khoản chưa được gán chi nhánh." };
      }
      query = query.eq("branch_id", claims.branch_id);
    }

    const { data: record, error } = await query.maybeSingle();

    if (error || !record) {
      if (error) {
        console.error(
          "[hr/actions:getAttendancePhotoUrl] Fetch attendance record error:",
          error,
        );
      }
      return { success: false, error: "Không tìm thấy dòng chấm công." };
    }
    if (!record.check_in_photo_path) {
      return { success: false, error: "Dòng chấm công này chưa có ảnh." };
    }

    const { data: signed, error: signError } = await createServiceClient()
      .storage.from(ATTENDANCE_PHOTO_BUCKET)
      .createSignedUrl(
        record.check_in_photo_path,
        ATTENDANCE_PHOTO_SIGNED_URL_TTL_SECONDS,
      );

    if (signError || !signed) {
      if (signError) {
        console.error(
          "[hr/actions:getAttendancePhotoUrl] Create signed storage URL error:",
          signError,
        );
      }
      return { success: false, error: "Không thể tạo đường dẫn xem ảnh." };
    }

    return {
      success: true,
      data: {
        url: signed.signedUrl,
        expires_in: ATTENDANCE_PHOTO_SIGNED_URL_TTL_SECONDS,
      },
    };
  },
);

const forceCloseStaleAttendanceSchema = z.object({
  attendanceId: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive().nullable(),
  note: z
    .string()
    .trim()
    .min(5, "Lý do đóng ca phải có ít nhất 5 ký tự")
    .max(500),
});

function mapForceCloseAttendanceError(message: string | undefined): string {
  if (message?.includes("stale_attendance_request_not_found")) {
    return "Ca chưa quá giờ kết thúc hoặc đã kết ca.";
  }
  if (
    message?.includes("forbidden_checkout_approval") ||
    message?.includes("not_authenticated_or_mismatch") ||
    message?.includes("force_close_scope_mismatch") ||
    message?.includes("cannot_force_close_own_attendance") ||
    message?.includes("force_close_hierarchy_not_allowed") ||
    message?.includes("force_close_approver_not_allowed")
  ) {
    return "Không có quyền đóng ca tại chi nhánh này.";
  }
  return "Không thể đóng ca. Vui lòng thử lại sau";
}

export const forceCloseStaleAttendance = withAction(
  {
    roles: HR_EMPLOYEE_VIEW_ROLES,
    schema: forceCloseStaleAttendanceSchema,
    permission: PERMISSION_KEYS.HR_FORCE_CLOSE_ATTENDANCE,
    permissionBranchId: (data) => data.branchId,
  },
  async (data, { supabase, claims, user }) => {
    if (
      claims.user_role === "branch_manager" &&
      claims.branch_id !== data.branchId
    ) {
      return {
        success: false,
        error: "Không có quyền đóng ca tại chi nhánh này",
      };
    }

    const { data: checkOutTime, error } = await supabase.rpc(
      "force_close_stale_attendance",
      {
        p_tenant_id: claims.tenant_id,
        p_branch_id: data.branchId as number,
        p_attendance_id: data.attendanceId,
        p_approved_by: user.id,
        p_note: data.note,
      },
    );

    if (error || !checkOutTime) {
      if (error) {
        console.error(
          "[hr/actions:forceCloseStaleAttendance] Force close rpc error:",
          { code: error.code },
        );
      }
      return {
        success: false,
        error: mapForceCloseAttendanceError(error?.message),
      };
    }

    logAudit(supabase, {
      action: "force_close_stale",
      entityType: "attendance_record",
      entityId: data.attendanceId,
    });

    revalidatePath("/hr");
    revalidatePath(`/br/${data.branchId}/team`);
    return { success: true, data: checkOutTime };
  },
);

const correctAttendanceSchema = z.object({
  attendanceId: z.coerce.number().int().positive(),
  checkIn: z.string().datetime({ offset: true }),
  checkOut: z.string().datetime({ offset: true }).nullable(),
  reason: z.string().trim().min(5).max(500),
});

export const correctAttendanceRecord = withAction(
  {
    roles: HR_ROLES,
    schema: correctAttendanceSchema,
    permission: PERMISSION_KEYS.HR_CORRECT_ATTENDANCE,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("correct_attendance_record", {
      p_attendance_id: data.attendanceId,
      p_check_in: data.checkIn,
      p_check_out: data.checkOut as string,
      p_reason: data.reason,
    });
    if (error) {
      const message = error.message.toLowerCase();
      return {
        success: false,
        error:
          error.code === "42501" || message.includes("forbidden")
            ? "Không có quyền hiệu chỉnh bảng công."
            : message.includes("time_invalid")
              ? "Giờ ra phải sau giờ vào."
              : message.includes("not_found")
                ? "Không tìm thấy bản ghi chấm công."
                : "Không thể hiệu chỉnh bảng công. Vui lòng thử lại.",
      };
    }
    revalidatePath("/hr/attendance");
    return { success: true };
  },
);

/* ─── Attendance Summary ─── */

const fetchAttendanceSummarySchema = z.object({
  branchId: z.coerce.number().int().positive().nullable().optional(),
  officeOnly: z.boolean().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export const fetchAttendanceSummary = withAction(
  {
    roles: SHIFT_ROLES,
    schema: fetchAttendanceSummarySchema,
    permission: PERMISSION_KEYS.HR_VIEW_EMPLOYEE,
    permissionBranchId: (data) => data.branchId ?? null,
  },
  async (data, { supabase, claims }) => {
    if (
      claims.user_role === "branch_manager" &&
      (data.branchId == null || claims.branch_id !== data.branchId)
    ) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const startDate = `${data.month}-01`;
    const [year, mon] = data.month.split("-").map(Number);
    const endDate = getVNMonthEndDateString(year!, mon!);

    const attendanceClient =
      claims.user_role === "branch_manager" ? createServiceClient() : supabase;

    let query = attendanceClient
      .from("attendance_records")
      .select(
        `
      employee_id, date, check_in, check_out,
      employees (
        id, employee_code,
        profiles ( full_name )
      )
    `,
      )
      .eq("tenant_id", claims.tenant_id)
      .gte("date", startDate)
      .lte("date", endDate!);
    if (data.branchId != null) query = query.eq("branch_id", data.branchId);
    else if (data.officeOnly) query = query.is("branch_id", null);
    const { data: result, error } = await query;

    if (error) {
      console.error(
        "[hr/actions:fetchAttendanceSummary] Fetch attendance summary error:",
        error,
      );
      return {
        success: false,
        error: hrActionCopy.fetchAttendanceSummaryFailed,
      };
    }

    // Per-shift attendance (D027): only closed shifts contribute workdays/hours.
    const summaryMap = new Map<
      number,
      {
        employee_id: number;
        employee_code: string;
        full_name: string;
        days: Map<string, number>;
        work_hours: number;
      }
    >();

    for (const record of result ?? []) {
      const empId = record.employee_id;
      if (!summaryMap.has(empId)) {
        const emp = record.employees as {
          id: number;
          employee_code: string;
          profiles: { full_name: string } | null;
        } | null;
        summaryMap.set(empId, {
          employee_id: empId,
          employee_code: emp?.employee_code ?? "",
          full_name: emp?.profiles?.full_name ?? "",
          days: new Map(),
          work_hours: 0,
        });
      }
      const s = summaryMap.get(empId)!;
      if (record.check_out) {
        s.days.set(record.date, (s.days.get(record.date) ?? 0) + 1);
        s.work_hours += calculateAttendanceWorkHours(
          record.check_in,
          record.check_out,
        );
      }
    }

    const summary = Array.from(summaryMap.values()).map((s) => {
      let workdays = 0;
      for (const count of s.days.values()) {
        workdays += countCompletedShiftWorkdays(count);
      }
      return {
        employee_id: s.employee_id,
        employee_code: s.employee_code,
        full_name: s.full_name,
        workdays,
        work_hours: s.work_hours,
      };
    });

    return { success: true, data: summary };
  },
);
