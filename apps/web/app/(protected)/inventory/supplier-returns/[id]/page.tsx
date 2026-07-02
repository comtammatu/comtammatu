import { notFound } from "next/navigation";
import { fetchSupplierReturnDetail } from "@/(protected)/inventory/supplier-return-actions";
import { fetchEntityAuditLogs } from "@/_lib/audit";
import { AppPage, AppPageHeader } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { AuditHistoryList } from "@/(protected)/inventory/_components/audit-history-list";
import { SupplierReturnDetailClient } from "./supplier-return-detail-client";

export default async function SupplierReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const returnId = Number(id);

  if (!returnId || returnId <= 0) notFound();

  const [result, auditLogs] = await Promise.all([
    fetchSupplierReturnDetail(returnId),
    fetchEntityAuditLogs("supplier_return", returnId, 50),
  ]);

  if (!result.success || !result.data) notFound();

  const detail = result.data as {
    header: {
      id: number;
      return_number: string;
      status: string;
      source: string;
      reason: string;
      resolution: string;
      total_value: number | null;
      created_at: string;
      confirmed_at: string | null;
      notes: string | null;
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
      line_total: number;
      reason_detail: string | null;
      photo_url: string | null;
      ingredients: { id: number; name: string; unit: string } | null;
    }>;
  };

  const { header, lines } = detail;

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        eyebrow="Kho hàng"
        title={header.return_number}
        description={`NCC: ${header.suppliers?.name ?? "—"} · Chi nhánh: ${header.branches?.name ?? "—"}`}
        tabs={
          <AppPageTabs
            items={[
              { value: "overview", label: "Tổng quan" },
              { value: "lines", label: "Dòng", count: lines.length },
              { value: "history", label: "Lịch sử", count: auditLogs.length },
            ]}
          >
            <TabsContent value="overview">
              <SupplierReturnDetailClient header={header} lines={lines} />
            </TabsContent>
            <TabsContent value="lines">
              <SupplierReturnDetailClient header={header} lines={lines} />
            </TabsContent>
            <TabsContent value="history">
              <AuditHistoryList logs={auditLogs} />
            </TabsContent>
          </AppPageTabs>
        }
      />
    </AppPage>
  );
}
