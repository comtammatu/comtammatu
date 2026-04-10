"use server";

import { z } from "zod";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../admin/_lib/auth";

const HR_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

/* ─── Fetch Contracts ─── */

export async function fetchContracts(
  employeeId: number,
): Promise<ActionResult> {
  const parsedId = z.coerce.number().int().positive().safeParse(employeeId);
  if (!parsedId.success) {
    return { success: false, error: "Employee ID không hợp lệ" };
  }

  const ctx = await getAuthContext(HR_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("employment_contracts")
    .select("*")
    .eq("employee_id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .order("start_date", { ascending: false });

  if (error) {
    return { success: false, error: "Không thể tải danh sách hợp đồng." };
  }

  return { success: true, data: data ?? [] };
}

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

export async function createContract(
  input: z.infer<typeof createContractSchema>,
): Promise<ActionResult> {
  const parsed = createContractSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(HR_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Count existing contracts to determine sequence
  const { count } = await supabase
    .from("employment_contracts")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", parsed.data.employeeId)
    .eq("tenant_id", claims.tenant_id);

  const contractSequence = (count ?? 0) + 1;

  // Warn if 3rd fixed_term (should be indefinite per BLLĐ 2019 Điều 20)
  if (parsed.data.contractType === "fixed_term" && contractSequence >= 3) {
    return {
      success: false,
      error:
        "Đã ký 2 HĐ xác định thời hạn. Theo Điều 20 BLLĐ 2019, hợp đồng thứ 3 phải là không xác định thời hạn.",
    };
  }

  // Expire any existing active contracts for this employee
  await supabase
    .from("employment_contracts")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("employee_id", parsed.data.employeeId)
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "active");

  const { data, error } = await supabase
    .from("employment_contracts")
    .insert({
      tenant_id: claims.tenant_id,
      employee_id: parsed.data.employeeId,
      contract_type: parsed.data.contractType,
      contract_number: parsed.data.contractNumber,
      signed_date: parsed.data.signedDate,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate ?? null,
      probation_end_date: parsed.data.probationEndDate ?? null,
      gross_salary: parsed.data.grossSalary,
      insurance_base_salary: parsed.data.insuranceBaseSalary,
      position: parsed.data.position,
      work_location: parsed.data.workLocation ?? null,
      contract_sequence: contractSequence,
      document_url: parsed.data.documentUrl ?? null,
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

  return { success: true, data };
}

/* ─── Terminate Contract ─── */

const terminateSchema = z.object({
  contractId: z.coerce.number().int().positive(),
  reason: z.string().min(1, "Lý do không được trống"),
  noticeDate: z.string().date(),
});

export async function terminateContract(
  input: z.infer<typeof terminateSchema>,
): Promise<ActionResult> {
  const parsed = terminateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(HR_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("employment_contracts")
    .update({
      status: "terminated",
      terminated_at: new Date().toISOString().split("T")[0],
      termination_notice_date: parsed.data.noticeDate,
      termination_reason: parsed.data.reason,
    })
    .eq("id", parsed.data.contractId)
    .eq("tenant_id", claims.tenant_id)
    .eq("status", "active")
    .select("id")
    .single();

  if (error || !data) {
    return {
      success: false,
      error: "Không thể chấm dứt hợp đồng. Kiểm tra lại trạng thái.",
    };
  }

  return { success: true };
}
