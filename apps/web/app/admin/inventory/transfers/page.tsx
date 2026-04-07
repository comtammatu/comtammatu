import {
  fetchStockTransfers,
  fetchBranchesForTransfer,
} from "../transfer-actions";
import { TransfersListClient } from "./transfers-list-client";
import type { TransferListRow } from "./transfers-list-client";

export default async function TransfersPage() {
  const [trRes, brRes] = await Promise.all([
    fetchStockTransfers(),
    fetchBranchesForTransfer(),
  ]);
  const rows: TransferListRow[] = trRes.success
    ? ((trRes.data ?? []) as TransferListRow[])
    : [];
  const destinationBranches = brRes.success
    ? ((brRes.data ?? []) as { id: number; name: string }[])
    : [];

  return (
    <TransfersListClient
      initial={rows}
      destinationBranches={destinationBranches}
    />
  );
}
