import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Phone, Receipt, Users } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  canAccess,
  extractClaims,
  PROCUREMENT_ROLES,
} from "@comtammatu/shared/auth";
import { MobilePage } from "../../_components/mobile/mobile-page";
import { MobileSectionHeader } from "../../_components/mobile/mobile-section-header";
import { InteractiveCard } from "../../_components/mobile/interactive-card";
import { MobileEmptyState } from "../../_components/mobile/mobile-empty-state";

type SupplierRow = {
  id: number;
  name: string;
  phone: string | null;
  recent_grn_count: number;
  last_grn_at: string | null;
};

async function loadSuppliers(): Promise<SupplierRow[]> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return [];
  const claims = extractClaims(session.user.app_metadata);
  if (!claims) return [];

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

  const recentMap = new Map<
    number,
    { count: number; last: string | null }
  >();
  for (const grn of grns) {
    const entry = recentMap.get(grn.supplier_id) ?? { count: 0, last: null };
    entry.count += 1;
    if (
      grn.received_date &&
      (!entry.last || grn.received_date > entry.last)
    ) {
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
  const date = new Date(iso);
  const now = new Date();
  const days = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 0) return "Hôm nay";
  if (days === 1) return "Hôm qua";
  if (days < 7) return `${days} ngày trước`;
  if (days < 30) return `${Math.floor(days / 7)} tuần trước`;
  return date.toLocaleDateString("vi-VN");
}

export default async function MobileGrnSupplierList() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  const claims = extractClaims(session.user.app_metadata);
  if (!claims) redirect("/login");
  if (!PROCUREMENT_ROLES.includes(claims.user_role)) {
    redirect("/inventory/m?forbidden=1");
  }
  if (!canAccess(claims.user_role, "inventory_procurement")) {
    redirect("/inventory/m?forbidden=1");
  }

  const suppliers = await loadSuppliers();

  return (
    <MobilePage>
      <MobileSectionHeader
        backHref="/inventory/m"
        backLabel="Trang chính"
        eyebrow="Phiếu nhập"
        title="Chọn nhà cung cấp"
        description="Nhà cung cấp gần đây hiển thị trước."
      />

      {suppliers.length === 0 ? (
        <MobileEmptyState
          icon={Users}
          title="Chưa có nhà cung cấp"
          description="Thêm nhà cung cấp ở mục Danh mục trước khi tạo phiếu nhập."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {suppliers.map((supplier) => {
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
                <Link href={`/inventory/m/grn/new/${supplier.id}`}>
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold uppercase text-primary">
                    {initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold leading-tight">
                      {supplier.name}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {supplier.phone ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3" />
                          {supplier.phone}
                        </span>
                      ) : null}
                      {supplier.recent_grn_count > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Receipt className="size-3" />
                          {supplier.recent_grn_count} phiếu
                        </span>
                      ) : null}
                      {lastLabel ? <span>{lastLabel}</span> : null}
                    </div>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </InteractiveCard>
            );
          })}
        </div>
      )}
    </MobilePage>
  );
}
