import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { fetchSupplierReturnDetail } from "@/(protected)/inventory/supplier-return-actions";
import { fetchEntityAuditLogs } from "@/_lib/audit";
import { currentUserHasPermission } from "@/_lib/permissions";
import { AppPage, AppPageHeader } from "@/components/surface";
import { SupplierReturnDetailClient } from "./supplier-return-detail-client";
import { SupplierReturnConfirmCta } from "./supplier-return-confirm-cta";

interface SupplierReturnDetailPageContentProps {
  returnId: number;
  routeBranchId?: number;
  embedded?: boolean;
}

export async function SupplierReturnDetailPageContent({
  returnId,
  routeBranchId,
  embedded = false,
}: SupplierReturnDetailPageContentProps) {
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
      branch_id: number;
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

  const { header, lines } = detail;

  if (routeBranchId != null && header.branch_id !== routeBranchId) notFound();

  const canConfirm = await currentUserHasPermission(
    header.branch_id,
    PERMISSION_KEYS.SUPPLIER_RETURN_CONFIRM,
  );

  const confirmCta = (
    <SupplierReturnConfirmCta
      returnId={header.id}
      status={header.status}
      resolution={header.resolution}
      canConfirm={canConfirm}
    />
  );

  if (embedded) {
    return (
      <div className="flex w-full flex-col gap-3">
        <SupplierReturnDetailClient
          header={header}
          lines={lines}
          auditLogs={auditLogs}
          embedded={true}
        />
        {confirmCta}
      </div>
    );
  }

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        eyebrow="Kho hàng"
        title={header.return_number}
        description={`NCC: ${header.suppliers?.name ?? "—"} · Chi nhánh: ${header.branches?.name ?? "—"}`}
        breadcrumb={
          <Link
            href="/inventory/supplier-returns"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:underline"
          >
            <IconArrowLeft className="size-4" />
            {ACTIONS_VI.back}
          </Link>
        }
      />
      <SupplierReturnDetailClient
        header={header}
        lines={lines}
        auditLogs={auditLogs}
        embedded={false}
      />
      {confirmCta}
    </AppPage>
  );
}

export default async function SupplierReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SupplierReturnDetailPageContent returnId={Number(id)} />;
}
