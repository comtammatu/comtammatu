import "server-only";

import { notFound } from "next/navigation";
import { z } from "zod";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { loadInventoryMonetaryAccess } from "./monetary-access";
import {
  defaultGrnDateField,
  parseGrnListStatus,
  parsePositiveId,
  type GrnListDateField,
  type GrnListFilters,
  type GrnListRow,
} from "./grn-list-model";

const PAGE_SIZE = 50;

const monetarySchema = z
  .object({
    receiptValue: z.coerce.number(),
    invoiceId: z.coerce.number().int().positive().nullable(),
    invoiceStatus: z.string().nullable(),
  })
  .nullable();

const rowSchema = z.object({
  id: z.coerce.number().int().positive(),
  code: z.string(),
  status: z.string(),
  supplierId: z.coerce.number().int().positive(),
  supplierName: z.string(),
  poId: z.coerce.number().int().positive(),
  poCode: z.string(),
  purchaseRequestId: z.coerce.number().int().positive().nullable(),
  purchaseRequestCode: z.string().nullable(),
  receivingSiteId: z.coerce.number().int().positive(),
  receivingSiteName: z.string(),
  expectedReceiveDate: z.string().nullable(),
  receivedDate: z.string().nullable(),
  lineCount: z.coerce.number().int().nonnegative(),
  completedLineCount: z.coerce.number().int().nonnegative(),
  shortageLineCount: z.coerce.number().int().nonnegative(),
  excessLineCount: z.coerce.number().int().nonnegative(),
  rejectedLineCount: z.coerce.number().int().nonnegative(),
  updatedAt: z.string(),
  handledBy: z.string().nullable(),
  monetary: monetarySchema,
});

const responseSchema = z.object({
  rows: z.array(rowSchema),
  total: z.coerce.number().int().nonnegative(),
});

export type GrnListSearchParams = {
  q?: string | string[];
  status?: string | string[];
  supplierId?: string | string[];
  dateField?: string | string[];
  dateFrom?: string | string[];
  dateTo?: string | string[];
  poId?: string | string[];
  requestId?: string | string[];
  branch?: string | string[];
  branchId?: string | string[];
  page?: string | string[];
  grnId?: string | string[];
  mode?: string | string[];
};

export type GrnListPageData = {
  rows: GrnListRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: GrnListFilters;
  canManageSupplierInvoice: boolean;
  canViewMonetary: boolean;
  loadFailed: boolean;
};

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function dateValue(value: string | string[] | undefined): string {
  const raw = first(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

export async function loadGrnListPageData(
  params: GrnListSearchParams & { routeBranchId?: number },
): Promise<GrnListPageData> {
  const auth = await loadAuthState();
  const { supabase, claims } = auth;
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId: params.routeBranchId,
    queryBranch: params.branch,
  });
  if (scope.outOfScope) notFound();

  const status = parseGrnListStatus(params.status);
  const requestedDateField = first(params.dateField);
  const dateField: GrnListDateField =
    requestedDateField === "expected" || requestedDateField === "received"
      ? requestedDateField
      : defaultGrnDateField(status);
  const rawPage = parsePositiveId(params.page);
  const page = rawPage ?? 1;
  const filters: GrnListFilters = {
    query: first(params.q),
    status,
    supplierId: parsePositiveId(params.supplierId),
    dateField,
    dateFrom: dateValue(params.dateFrom),
    dateTo: dateValue(params.dateTo),
    poId: parsePositiveId(params.poId),
    purchaseRequestId: parsePositiveId(params.requestId),
    branchId: scope.selectedBranchId,
  };

  const [canManageSupplierInvoice, monetaryAccess, result] = await Promise.all([
    probePermission(
      auth,
      PERMISSION_KEYS.PROCUREMENT_INVOICE_CREATE,
      scope.selectedBranchId,
    ),
    loadInventoryMonetaryAccess(claims.user_role),
    supabase.rpc("list_goods_receipt_notes" as never, {
      p_query: filters.query || null,
      p_status: filters.status,
      p_supplier_id: filters.supplierId,
      p_date_field: filters.dateField,
      p_date_from: filters.dateFrom || null,
      p_date_to: filters.dateTo || null,
      p_po_id: filters.poId,
      p_purchase_request_id: filters.purchaseRequestId,
      p_branch_id: filters.branchId,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    } as never),
  ]);

  const parsed = responseSchema.safeParse(result.data);
  if (result.error || !parsed.success) {
    return {
      rows: [],
      total: 0,
      page,
      pageSize: PAGE_SIZE,
      filters,
      canManageSupplierInvoice,
      canViewMonetary: monetaryAccess.purchasePrice,
      loadFailed: true,
    };
  }

  return {
    rows: parsed.data.rows.map((row) => ({
      ...row,
      invoiceId: row.monetary?.invoiceId ?? null,
      monetary: monetaryAccess.purchasePrice ? row.monetary : null,
    })),
    total: parsed.data.total,
    page,
    pageSize: PAGE_SIZE,
    filters,
    canManageSupplierInvoice,
    canViewMonetary: monetaryAccess.purchasePrice,
    loadFailed: false,
  };
}
