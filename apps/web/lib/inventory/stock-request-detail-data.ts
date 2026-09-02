import "server-only";

import type { AuditLogRow } from "@/_lib/audit";
import type { TenantSupabase } from "@lib/inventory/types";
import type { StockJourney } from "./stock-journey-model";

export type StockRequestDetailItem = {
  id: number;
  ingredientId: number;
  ingredientName: string;
  entryUnitId: number;
  unitLabel: string;
  quantity: number;
  fulfillSiteKind: "central_supply" | "central_kitchen";
  status: string;
  transferId: number | null;
  notes: string | null;
};

export type StockRequestDetailTransfer = {
  id: number;
  transferNumber: string;
  status: string;
  fromBranchKind: "central_supply" | "central_kitchen" | "branch";
  fromBranchName: string;
  toBranchName: string;
};

export type StockRequestDetailData = {
  id: number;
  requestNumber: string;
  status: string;
  branchId: number;
  branchName: string;
  neededAt: string | null;
  notes: string | null;
  statusReason: string | null;
  submittedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  items: StockRequestDetailItem[];
  transfers: StockRequestDetailTransfer[];
  journey: StockJourney;
  auditLogs: AuditLogRow[];
};

export async function loadStockRequestDetail(_args: {
  supabase: TenantSupabase;
  tenantId: number;
  requestId: number;
  branchId?: number;
}): Promise<StockRequestDetailData | null> {
  return null;
}
