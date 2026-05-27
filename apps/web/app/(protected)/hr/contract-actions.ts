"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import { getVNDateString } from "@comtammatu/shared/time";

const HR_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

/* ─── Fetch Contracts ─── */

const fetchContractsSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
});

export const fetchContracts = withAction(
  {
    roles: HR_ROLES,
    schema: fetchContractsSchema,
    permission: PERMISSION_KEYS.HR_CONTRACT_CREATE,
    permissionMode: "permission",
  },
  async (data, { supabase, claims }) => {
    const { data: result, error } = await supabase
      .from("employment_contracts")
      .select("*")
      .eq("employee_id", data.employeeId)
      .eq("tenant_id", claims.tenant_id)
      .order("start_date", { ascending: false });

    if (error) {
      return { success: false, error: "Không thể tải danh sách hợp đồng." };
    }

    return { success: true, data: result ?? [] };
  },
);

/* ─── Create Contract ─── */

const createContractSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  contractType: z.enum(["indefinite", "fixed_term", "seasonal", "probation"]),
  contractNumber: z.string().min(1, "Số hợp đồng không được trống"),
  signedDate: z.string().date(),
  startDate: z.string().date(),
  endDate: z.string().date().optional(),
  probationEndDate: z.string().date().optional(),
  grossSalary: z.coerce.number().positive("Lương phải > 0"),
  insuranceBaseSalary: z.coerce.number().nonnegative("Lương BH phải >= 0"),
  position: z.string().min(1, "Chức danh không được trống"),
  workLocation: z.string().optional(),
  documentUrl: z.string().optional(),
});

export const createContract = withAction(
  {
    roles: HR_ROLES,
    schema: createContractSchema,
    permission: PERMISSION_KEYS.HR_CONTRACT_CREATE,
    permissionMode: "permission",
  },
  async (data, { supabase, claims }) => {
    // Count existing contracts to determine sequence
    const { count } = await supabase
      .from("employment_contracts")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", data.employeeId)
      .eq("tenant_id", claims.tenant_id);

    const contractSequence = (count ?? 0) + 1;

    // Warn if 3rd fixed_term (should be indefinite per BLLĐ 2019 Điều 20)
    if (data.contractType === "fixed_term" && contractSequence >= 3) {
      return {
        success: false,
        error:
          "Đã ký 2 HĐ xác định thời hạn. Theo Điều 20 BLLĐ 2019, hợp đồng thứ 3 phải là không xác định thời hạn.",
      };
    }

    // Expire any existing active contracts for this employee
    // TODO: migrate to atomic RPC to prevent partial-expire-no-insert race
    const { error: expireError } = await supabase
      .from("employment_contracts")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("employee_id", data.employeeId)
      .eq("tenant_id", claims.tenant_id)
      .eq("status", "active");

    if (expireError) {
      return {
        success: false,
        error: "Không thể hết hạn hợp đồng cũ. Vui lòng thử lại.",
      };
    }

    const { data: result, error } = await supabase
      .from("employment_contracts")
      .insert({
        tenant_id: claims.tenant_id,
        employee_id: data.employeeId,
        contract_type: data.contractType,
        contract_number: data.contractNumber,
        signed_date: data.signedDate,
        start_date: data.startDate,
        end_date: data.endDate ?? null,
        probation_end_date: data.probationEndDate ?? null,
        gross_salary: data.grossSalary,
        insurance_base_salary: data.insuranceBaseSalary,
        position: data.position,
        work_location: data.workLocation ?? null,
        contract_sequence: contractSequence,
        document_url: data.documentUrl ?? null,
        status: "active",
      })
      .select("id, contract_number")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "Số hợp đồng đã tồn tại." };
      }
      return { success: false, error: "Không thể tạo hợp đồng." };
    }

    return { success: true, data: result };
  },
);

/* ─── Terminate Contract ─── */

const terminateSchema = z.object({
  contractId: z.coerce.number().int().positive(),
  reason: z.string().min(1, "Lý do không được trống"),
  noticeDate: z.string().date(),
});

export const terminateContract = withAction(
  {
    roles: HR_ROLES,
    schema: terminateSchema,
    permission: PERMISSION_KEYS.HR_CONTRACT_CREATE,
    permissionMode: "permission",
  },
  async (data, { supabase, claims }) => {
    const { data: result, error } = await supabase
      .from("employment_contracts")
      .update({
        status: "terminated",
        terminated_at: getVNDateString(),
        termination_notice_date: data.noticeDate,
        termination_reason: data.reason,
      })
      .eq("id", data.contractId)
      .eq("tenant_id", claims.tenant_id)
      .eq("status", "active")
      .select("id")
      .single();

    if (error || !result) {
      return {
        success: false,
        error: "Không thể chấm dứt hợp đồng. Kiểm tra lại trạng thái.",
      };
    }

    return { success: true };
  },
);
