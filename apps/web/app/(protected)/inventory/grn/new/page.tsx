import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  ChevronRight as IconChevronRight,
  Phone as IconPhone,
  Receipt as IconReceipt,
  Users as IconUsers,
} from "lucide-react";
import { loadAuthState } from "@/_lib/auth";
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

async function loadSuppliers(): Promise<SupplierRow[]> {
  const { supabase, claims } = await loadAuthState();

  const [suppliersRes, grnRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, phone")
      .eq("tenant_id", claims.tenant_id)
      .order("name"),
    supabase
      .from("goods_received_notes")
      .select("id, supplier_id, received_date")
      .eq("tenant_id", claims.tenant_id)
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

export default async function GrnNewSupplierPage() {
  const { claims } = await loadAuthState();
  if (
    !PROCUREMENT_ROLES.includes(claims.user_role) ||
    !canAccess(claims.user_role, "inventory_procurement")
  ) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  const [suppliers, openPosRes] = await Promise.all([
    loadSuppliers(),
    fetchOpenPurchaseOrdersForReceiving(),
  ]);

  const openPos: OpenPurchaseOrderRow[] = openPosRes.success
    ? (openPosRes.data ?? [])
    : [];

  return (
    <AppPage width="narrow">
      <AppPageHeader
        breadcrumb={
          <Link
            href="/inventory/grn"
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

      {openPos.length > 0 ? <GrnFromPoList openPos={openPos} /> : null}

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
                <Link href={`/inventory/grn/new/${supplier.id}`}>
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
    </AppPage>
  );
}
