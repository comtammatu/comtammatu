import type { RecordedSaleConsumptionOrder } from "@lib/inventory/recorded-sale-consumption-model";

export type IssueRow = {
  id: number;
  code: string;
  type: string;
  branchName: string;
  branchKind: string | null;
  date: string;
  createdBy: string;
  status: string;
};

export type IssueBranchOption = {
  id: number;
  name: string;
  branchKind: string | null;
};

export type RecordedConsumptionRow = RecordedSaleConsumptionOrder;
