"use server";

import { z } from "zod";
import { INVENTORY_OPS_ROLES, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { withAction, type ActionContext } from "@/_lib/with-action";
import { resolveDefaultInventoryLocation } from "./_lib/inventory-location-compat";
import { PG_ERR } from "./_lib/constants";

const correctionDocumentTypes = [
  "grn",
  "issue",
  "transfer",
  "production_order",
] as const;

const correctionSchema = z.object({
  documentType: z.enum(correctionDocumentTypes),
  documentId: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive(),
  ingredientId: z.coerce.number().int().positive(),
  quantityChange: z.coerce.number().refine((value) => value !== 0, {
    error: "Số lượng điều chỉnh không được bằng 0.",
  }),
  reason: z
    .string()
    .trim()
    .min(10, { error: "Lý do điều chỉnh cần ít nhất 10 ký tự." })
    .max(500, { error: "Lý do điều chỉnh tối đa 500 ký tự." }),
});

export type InventoryCorrectionDocumentType =
  (typeof correctionDocumentTypes)[number];

type CorrectionInput = z.infer<typeof correctionSchema>;
type InventorySupabase = ActionContext["supabase"];

type SourceDocument = {
  branchId: number;
  code: string;
  status: string;
  link: {
    grn_id?: number;
    issue_id?: number;
    transfer_id?: number;
    production_order_id?: number;
  };
};

async function hasInventoryWritePermission(
  supabase: InventorySupabase,
  branchId: number,
) {
  const { data, error } = await supabase.rpc("has_permission", {
    p_branch_id: branchId,
    p_key: PERMISSION_KEYS.INVENTORY_WRITE,
  });
  return !error && data === true;
}

function isPostedStatus(status: string, allowed: readonly string[]) {
  return allowed.includes(status);
}

async function loadGrnSource(
  supabase: InventorySupabase,
  tenantId: number,
  input: CorrectionInput,
): Promise<SourceDocument | null> {
  const { data: grn, error } = await supabase
    .from("goods_received_notes")
    .select("id, branch_id, status, grn_number")
    .eq("id", input.documentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !grn) return null;
  if (grn.branch_id !== input.branchId) return null;
  if (!isPostedStatus(grn.status, ["confirmed"])) return null;

  const { data: line, error: lineError } = await supabase
    .from("grn_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("grn_id", grn.id)
    .eq("ingredient_id", input.ingredientId)
    .maybeSingle();

  if (lineError || !line) return null;

  return {
    branchId: grn.branch_id,
    code: grn.grn_number,
    status: grn.status,
    link: { grn_id: grn.id },
  };
}

async function loadIssueSource(
  supabase: InventorySupabase,
  tenantId: number,
  input: CorrectionInput,
): Promise<SourceDocument | null> {
  const { data: issue, error } = await supabase
    .from("stock_issues")
    .select("id, branch_id, status, issue_number")
    .eq("id", input.documentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !issue) return null;
  if (issue.branch_id !== input.branchId) return null;
  if (!isPostedStatus(issue.status, ["confirmed"])) return null;

  const { data: line, error: lineError } = await supabase
    .from("stock_issue_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("issue_id", issue.id)
    .eq("ingredient_id", input.ingredientId)
    .maybeSingle();

  if (lineError || !line) return null;

  return {
    branchId: issue.branch_id,
    code: issue.issue_number,
    status: issue.status,
    link: { issue_id: issue.id },
  };
}

async function loadTransferSource(
  supabase: InventorySupabase,
  tenantId: number,
  input: CorrectionInput,
): Promise<SourceDocument | null> {
  const { data: transfer, error } = await supabase
    .from("stock_transfers")
    .select("id, from_branch_id, to_branch_id, status, transfer_number")
    .eq("id", input.documentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !transfer) return null;
  if (
    input.branchId !== transfer.from_branch_id &&
    input.branchId !== transfer.to_branch_id
  ) {
    return null;
  }
  if (
    !isPostedStatus(transfer.status, [
      "confirmed_ship",
      "in_transit",
      "confirmed_receive",
      "received",
    ])
  ) {
    return null;
  }
  if (
    transfer.status !== "received" &&
    input.branchId !== transfer.from_branch_id
  ) {
    return null;
  }

  const { data: line, error: lineError } = await supabase
    .from("stock_transfer_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("transfer_id", transfer.id)
    .eq("ingredient_id", input.ingredientId)
    .maybeSingle();

  if (lineError || !line) return null;

  return {
    branchId: input.branchId,
    code: transfer.transfer_number,
    status: transfer.status,
    link: { transfer_id: transfer.id },
  };
}

async function loadProductionSource(
  supabase: InventorySupabase,
  tenantId: number,
  input: CorrectionInput,
): Promise<SourceDocument | null> {
  const { data: order, error } = await supabase
    .from("production_orders")
    .select("id, branch_id, status, production_number")
    .eq("id", input.documentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !order) return null;
  if (order.branch_id !== input.branchId) return null;
  if (!isPostedStatus(order.status, ["completed"])) return null;

  const { data: outputLine, error: outputLineError } = await supabase
    .from("production_order_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("production_order_id", order.id)
    .eq("finished_good_id", input.ingredientId)
    .maybeSingle();

  if (outputLineError || !outputLine) return null;

  return {
    branchId: order.branch_id,
    code: order.production_number,
    status: order.status,
    link: { production_order_id: order.id },
  };
}

async function loadSourceDocument(
  supabase: InventorySupabase,
  tenantId: number,
  input: CorrectionInput,
) {
  if (input.documentType === "grn") {
    return loadGrnSource(supabase, tenantId, input);
  }
  if (input.documentType === "issue") {
    return loadIssueSource(supabase, tenantId, input);
  }
  if (input.documentType === "transfer") {
    return loadTransferSource(supabase, tenantId, input);
  }
  return loadProductionSource(supabase, tenantId, input);
}

function correctionLabel(documentType: InventoryCorrectionDocumentType) {
  if (documentType === "grn") return "GRN";
  if (documentType === "issue") return "Phiếu xuất";
  if (documentType === "transfer") return "Điều chuyển";
  return "Sản xuất";
}

export const createInventoryDocumentCorrection = withAction(
  {
    roles: INVENTORY_OPS_ROLES,
    schema: correctionSchema,
  },
  async (data, { supabase, claims, user }): Promise<ActionResult> => {
    const source = await loadSourceDocument(supabase, claims.tenant_id, data);
    if (!source) {
      return {
        success: false,
        error:
          "Không tìm thấy chứng từ đã chốt phù hợp với mặt hàng và chi nhánh.",
      };
    }

    const hasPermission = await hasInventoryWritePermission(
      supabase,
      source.branchId,
    );
    if (!hasPermission) {
      return { success: false, error: "Không có quyền điều chỉnh tồn kho." };
    }

    const defaultLocationId = await resolveDefaultInventoryLocation(
      supabase,
      claims.tenant_id,
      source.branchId,
      data.quantityChange > 0 ? "receive" : "issue",
    );
    if (defaultLocationId == null) {
      return {
        success: false,
        error: "Chi nhánh chưa có kho mặc định. Vui lòng liên hệ quản trị.",
      };
    }

    const { data: row, error } = await supabase
      .from("stock_movements")
      .insert({
        tenant_id: claims.tenant_id,
        branch_id: source.branchId,
        ingredient_id: data.ingredientId,
        type: "adjustment",
        quantity_change: data.quantityChange,
        reason: `${correctionLabel(data.documentType)} ${source.code}: ${data.reason}`,
        created_by: user.id,
        location_id: defaultLocationId,
        ...source.link,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      if (error.code === PG_ERR.CHECK_VIOLATION) {
        return {
          success: false,
          error: "Không thể điều chỉnh tồn kho do dữ liệu không hợp lệ.",
        };
      }
      if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE) {
        return { success: false, error: "Không có quyền điều chỉnh tồn kho." };
      }
      return { success: false, error: "Không thể tạo điều chỉnh tồn kho." };
    }

    if (!row) {
      return { success: false, error: "Không thể tạo điều chỉnh tồn kho." };
    }

    return { success: true, data: row };
  },
);
