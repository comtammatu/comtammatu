import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  ClipboardList as IconClipboardList,
  Truck as IconTruck,
} from "lucide-react";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasAnyPermissionAny } from "@/_lib/permissions";
import { resolveInventoryListScope } from "../../_lib/inventory-scope";
import type { TenantSupabase } from "../../_lib/types";
import {
  canAccess,
  PERMISSION_KEYS,
  PROCUREMENT_ROLES,
} from "@comtammatu/shared/auth";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import {
  diffVNDateDays,
  formatVNDate,
  getVNDateString,
} from "@comtammatu/shared/time";
import {
  AppPageHeader,
  AppSection,
  DocumentFormFrame,
} from "@/components/surface";
import {
  fetchOpenPurchaseOrdersForReceiving,
  type OpenPurchaseOrderRow,
} from "../../purchase-order-actions";
import { GrnFromPoList } from "./grn-from-po-list";
import { SupplierPicker } from "./supplier-picker";

type SupplierRow = {
  id: number;
  name: string;
  phone: string | null;
  recent_grn_count: number;
  last_grn_at: string | null;
};

async function loadSuppliers(
  tenantId: number,
  supabase: TenantSupabase,
): Promise<SupplierRow[]> {
  const [suppliersRes, grnRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, phone")
      .eq("tenant_id", tenantId)
      .order("name"),
    supabase
      .from("goods_received_notes")
      .select("id, supplier_id, received_date")
      .eq("tenant_id", tenantId)
      .order("received_date", { ascending: false })
      .limit(200),
  ]);

  const suppliers = (suppliersRes.data ?? []) as Array<{
    id: number;
    name: string;
    phone: string | null;
  }>;
  const grns = (grnRes.data ?? []) as Array<{
    supplier_id: number;
    received_date: string | null;
  }>;

  const recentMap = new Map<number, { count: number; last: string | null }>();
  for (const grn of grns) {
    const entry = recentMap.get(grn.supplier_id) ?? { count: 0, last: null };
    entry.count += 1;
    if (grn.received_date && (!entry.last || grn.received_date > entry.last)) {
      entry.last = grn.received_date;
    }
    recentMap.set(grn.supplier_id, entry);
  }

  const rows: SupplierRow[] = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    phone: s.phone,
    recent_grn_count: recentMap.get(s.id)?.count ?? 0,
    last_grn_at: recentMap.get(s.id)?.last ?? null,
  }));

  rows.sort((a, b) => {
    if (a.recent_grn_count !== b.recent_grn_count) {
      return b.recent_grn_count - a.recent_grn_count;
    }
    return a.name.localeCompare(b.name, "vi");
  });
  return rows;
}

function formatLastGrn(iso: string | null): string | null {
  if (!iso) return null;
  const days = diffVNDateDays(getVNDateString(iso), getVNDateString());
  if (days <= 0) return INVENTORY_VI.today;
  if (days === 1) return INVENTORY_VI.yesterday;
  if (days < 7) return `${days} ngày trước`;
  if (days < 30) return `${Math.floor(days / 7)} tuần trước`;
  return formatVNDate(iso);
}

function formatRecentGrnCount(count: number): string {
  return `${count} phiếu`;
}

interface GrnNewPageContentProps {
  searchParams?: Promise<{ branchId?: string | string[] }>;
  routeBranchId?: number;
  basePath?: string;
  grnListBasePath?: string;
  embedded?: boolean;
}

export async function GrnNewPageContent({
  searchParams,
  routeBranchId,
  basePath = "/inventory/grn/new",
  grnListBasePath = "/inventory/grn",
  embedded = false,
}: GrnNewPageContentProps) {
  const params = searchParams ? await searchParams : {};
  const { supabase, claims } = await loadAuthState();
  if (
    !PROCUREMENT_ROLES.includes(claims.user_role) ||
    !canAccess(claims.user_role, "inventory_procurement")
  ) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId: params.branchId,
  });
  if (scope.outOfScope) notFound();

  const [suppliers, openPosRes] = await Promise.all([
    loadSuppliers(claims.tenant_id, supabase),
    fetchOpenPurchaseOrdersForReceiving(),
  ]);

  const openPos: OpenPurchaseOrderRow[] = openPosRes.success
    ? (openPosRes.data ?? [])
    : [];

  const canCreateSupplier = await currentUserHasAnyPermissionAny([
    PERMISSION_KEYS.PROCUREMENT_SUPPLIER_MANAGE,
  ]);

  const pickerSuppliers = suppliers.map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone,
    recentLabel:
      supplier.recent_grn_count > 0
        ? formatRecentGrnCount(supplier.recent_grn_count)
        : null,
    lastLabel: formatLastGrn(supplier.last_grn_at),
  }));

  const content = (
    <>
      <AppSection
        icon={<IconTruck />}
        title={INVENTORY_VI.receiveBySupplierTitle}
        description={INVENTORY_VI.receiveBySupplierDescription}
      >
        <div className="flex flex-col gap-3">
          <SupplierPicker
            suppliers={pickerSuppliers}
            basePath={basePath}
            canCreate={canCreateSupplier}
          />
        </div>
      </AppSection>

      {openPos.length > 0 ? (
        <AppSection
          icon={<IconClipboardList />}
          title={INVENTORY_VI.receiveByPoTitle}
          badge={{ children: openPos.length, variant: "secondary" }}
        >
          <GrnFromPoList openPos={openPos} grnBasePath={grnListBasePath} />
        </AppSection>
      ) : null}
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  const header = (
    <AppPageHeader
      breadcrumb={
        <Link
          href={grnListBasePath}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <IconArrowLeft className="size-4" /> {INVENTORY_VI.grnListBackLabel}
        </Link>
      }
      eyebrow={INVENTORY_VI.receivingEyebrow}
      title={INVENTORY_VI.chooseSourceTitle}
      description={INVENTORY_VI.chooseSourceDescription}
    />
  );

  return (
    <DocumentFormFrame header={header} width="wide">
      {content}
    </DocumentFormFrame>
  );
}

export default async function GrnNewPage({
  searchParams,
}: {
  searchParams?: Promise<{ branchId?: string | string[] }>;
}) {
  return <GrnNewPageContent searchParams={searchParams} />;
}
