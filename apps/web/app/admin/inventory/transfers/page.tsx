import {
  fetchStockTransfers,
  fetchBranchesForTransfer,
} from "../transfer-actions";
import { TransfersListClient } from "./transfers-list-client";
import type {
  BranchForTransfer,
  TransferListRow,
} from "./transfers-list-client";

export default async function TransfersPage() {
  const [trRes, brRes] = await Promise.all([
    fetchStockTransfers(),
    fetchBranchesForTransfer(),
  ]);
  const rows: TransferListRow[] = trRes.success
    ? ((trRes.data ?? []) as TransferListRow[])
    : [];
  const branches: BranchForTransfer[] = brRes.success
    ? ((brRes.data ?? []) as BranchForTransfer[])
    : [];

  return <TransfersListClient initial={rows} branches={branches} />;
}
