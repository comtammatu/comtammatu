import { fetchSupplierReturns } from "../supplier-return-actions";
import { resolveRequestedBranchId } from "../_lib/inventory-scope";
import { SupplierReturnsClient } from "./supplier-returns-client";

export default async function SupplierReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const branchFilter =
    (await resolveRequestedBranchId(params.branchId)) ?? undefined;
  const res = await fetchSupplierReturns(branchFilter);
  const rows = res.success ? ((res.data as ReturnRow[]) ?? []) : [];
  return (
    <SupplierReturnsClient
      rows={rows}
      error={res.success ? null : (res.error ?? "Không thể tải danh sách.")}
    />
  );
}

type ReturnRow = {
  id: number;
  return_number: string;
  status: string;
  source: string;
  reason: string;
  resolution: string;
  total_value: number;
  created_at: string;
  confirmed_at: string | null;
  branch_id: number;
  supplier_id: number;
  grn_id: number | null;
  suppliers: { id: number; name: string } | null;
  branches: { id: number; name: string } | null;
  goods_received_notes: { id: number; grn_number: string } | null;
};
