import { fetchSupplierReturns } from "@/(protected)/inventory/supplier-return-actions";
import { AppPage, AppPageHeader, AppEmptyState } from "@/components/surface";
import { SupplierReturnsClient } from "./supplier-returns-client";

export default async function SupplierReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const branchId = Array.isArray(params.branchId)
    ? Number(params.branchId[0])
    : params.branchId
      ? Number(params.branchId)
      : undefined;

  const result = await fetchSupplierReturns(branchId);
  const returns = result.success ? ((result.data ?? []) as SupplierReturnRow[]) : [];

  return (
    <AppPage>
      <AppPageHeader
        eyebrow="Kho hàng"
        title="Phiếu trả hàng NCC"
        description="Quản lý các phiếu trả hàng nhà cung cấp."
      />
      {returns.length === 0 ? (
        <AppEmptyState mode="no-data" title="Chưa có phiếu trả hàng" />
      ) : (
        <SupplierReturnsClient initialReturns={returns} />
      )}
    </AppPage>
  );
}

export interface SupplierReturnRow {
  id: number;
  return_number: string;
  status: string;
  source: string;
  reason: string;
  resolution: string;
  total_value: number | null;
  created_at: string;
  confirmed_at: string | null;
  branch_id: number;
  supplier_id: number;
  grn_id: number | null;
  suppliers: { id: number; name: string } | null;
  branches: { id: number; name: string } | null;
  goods_received_notes: { id: number; grn_number: string } | null;
}
