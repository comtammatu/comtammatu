import { notFound } from "next/navigation";
import { fetchSupplierReturnDetail } from "../../supplier-return-actions";
import { SupplierReturnDetailClient } from "./supplier-return-detail-client";

export default async function SupplierReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await fetchSupplierReturnDetail(Number(id));
  if (!res.success || !res.data) notFound();

  const d = res.data as {
    header: {
      id: number;
      return_number: string;
      status: string;
      source: string;
      reason: string;
      resolution: string;
      notes: string | null;
      total_value: number;
      created_at: string;
      confirmed_at: string | null;
      grn_id: number | null;
      branch_id: number;
      supplier_id: number;
      suppliers: { id: number; name: string } | null;
      branches: { id: number; name: string } | null;
      goods_received_notes: { id: number; grn_number: string } | null;
    };
    lines: Array<{
      id: number;
      ingredient_id: number;
      quantity: number;
      unit: string;
      unit_cost: number;
      total_cost: number;
      reason_detail: string | null;
      photo_url: string | null;
      ingredients: { id: number; name: string; unit: string } | null;
    }>;
  };

  return <SupplierReturnDetailClient data={d} />;
}
