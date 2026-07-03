import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  ChevronRight as IconChevronRight,
  Phone as IconPhone,
  Receipt as IconReceipt,
  Users as IconUsers,
} from "lucide-react";
import { loadAuthState } from "@/_lib/auth";
import { resolveInventoryListScope } from "../../_lib/inventory-scope";
import type { TenantSupabase } from "../../_lib/types";
import {
  canAccess,
  PROCUREMENT_ROLES,
} from "@comtammatu/shared/auth";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import {
  diffVNDateDays,
  formatVNDate,
  getVNDateString,
} from "@comtammatu/shared/time";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import {
  fetchOpenPurchaseOrdersForReceiving,
  type OpenPurchaseOrderRow,
} from "../../purchase-order-actions";
import { GrnFromPoList } from "./grn-from-po-list";

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

  const content = (
    <>
      {openPos.length > 0 ? (
        <GrnFromPoList openPos={openPos} grnBasePath={grnListBasePath} />
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            {INVENTORY_VI.adhocBySupplierHeading}
          </p>
        </div>
        {suppliers.length === 0 ? (
          <AppEmptyState
            compact
            icon={<IconUsers />}
            title={INVENTORY_VI.noSupplierTitle}
            description={INVENTORY_VI.noSupplierDescription}
          />
        ) : (
          suppliers.map((supplier) => {
            const initials = supplier.name.slice(0, 2).toUpperCase();
            const lastLabel = formatLastGrn(supplier.last_grn_at);
            return (
              <InteractiveCard
                key={supplier.id}
                asChild
                minHeight="mobile"
                padding="default"
                className="h-auto"
              >
                <Link href={`${basePath}/${supplier.id}`}>
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold uppercase text-muted-foreground">
                    {initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold leading-tight">
                      {supplier.name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {supplier.phone ? (
                        <span className="inline-flex items-center gap-1">
                          <IconPhone className="size-3" />
                          {supplier.phone}
                        </span>
                      ) : null}
                      {supplier.recent_grn_count > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <IconReceipt className="size-3" />
                          {formatRecentGrnCount(supplier.recent_grn_count)}
                        </span>
                      ) : null}
                      {lastLabel ? <span>{lastLabel}</span> : null}
                    </div>
                  </div>
                  <IconChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </InteractiveCard>
            );
          })
        )}
      </section>
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return (
    <AppPage width="narrow">
      <AppPageHeader
        breadcrumb={
          <Link
            href={grnListBasePath}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <IconArrowLeft className="size-4" />{" "}
            {INVENTORY_VI.grnListBackLabel}
          </Link>
        }
        eyebrow={INVENTORY_VI.receivingEyebrow}
        title={INVENTORY_VI.chooseSourceTitle}
        description={INVENTORY_VI.chooseSourceDescription}
      />
      {content}
    </AppPage>
  );
}

export default async function GrnNewPage({
  searchParams,
}: {
  searchParams?: Promise<{ branchId?: string | string[] }>;
}) {
  return <GrnNewPageContent searchParams={searchParams} />;
}
