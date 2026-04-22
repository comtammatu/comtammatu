import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  extractClaimsFromAccessToken,
  INVENTORY_OPS_ROLES,
} from "@comtammatu/shared/auth";
import { MobilePage } from "../../_components/mobile/mobile-page";
import { MobileSectionHeader } from "../../_components/mobile/mobile-section-header";
import { MobileEmptyState } from "../../_components/mobile/mobile-empty-state";
import { MobileStockClient } from "./mobile-stock-client";
import { getBranchSiteDisplayName } from "../../_lib/branch-site-labels";

type StockRow = {
  ingredientId: number;
  name: string;
  sku: string | null;
  unit: string;
  category: string | null;
  quantity: number;
  minLevel: number;
  reorderPoint: number | null;
  maxLevel: number | null;
  status: "out" | "low" | "over" | "normal";
  branchId: number | null;
  branchName: string;
};

function classifyStatus(
  qty: number,
  min: number,
  max: number | null,
): StockRow["status"] {
  if (qty <= 0) return "out";
  if (min > 0 && qty < min) return "low";
  if (max != null && max > 0 && qty > max) return "over";
  return "normal";
}

export default async function MobileStockPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  const claims = extractClaimsFromAccessToken(session.access_token);
  if (!claims || !INVENTORY_OPS_ROLES.includes(claims.user_role)) {
    redirect("/inventory/m?forbidden=1");
  }

  const [ingredientsRes, stockRes, branchesRes] = await Promise.all([
    supabase
      .from("ingredients")
      .select(
        "id, name, sku, unit, category, min_stock_level, reorder_point, max_stock_level, is_active",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name")
      .limit(500),
    claims.branch_id
      ? supabase
          .from("stock_levels")
          .select("ingredient_id, current_quantity, branch_id")
          .eq("tenant_id", claims.tenant_id)
          .eq("branch_id", claims.branch_id)
      : supabase
          .from("stock_levels")
          .select("ingredient_id, current_quantity, branch_id")
          .eq("tenant_id", claims.tenant_id),
    supabase
      .from("branches")
      .select("id, name, branch_kind")
      .eq("tenant_id", claims.tenant_id),
  ]);

  const branchById = new Map(
    (branchesRes.data ?? []).map(
      (b) => [b.id, getBranchSiteDisplayName(b)] as const,
    ),
  );

  const qtyByKey = new Map<string, { qty: number; branchId: number }>();
  for (const entry of stockRes.data ?? []) {
    const key = claims.branch_id
      ? `${entry.ingredient_id}`
      : `${entry.ingredient_id}:${entry.branch_id}`;
    const existing = qtyByKey.get(key);
    if (claims.branch_id) {
      qtyByKey.set(key, {
        qty: Number(entry.current_quantity ?? 0),
        branchId: entry.branch_id,
      });
    } else {
      qtyByKey.set(key, {
        qty: (existing?.qty ?? 0) + Number(entry.current_quantity ?? 0),
        branchId: entry.branch_id,
      });
    }
  }

  const rows: StockRow[] = [];
  for (const ing of ingredientsRes.data ?? []) {
    const min = Number(ing.min_stock_level ?? 0);
    const reorder = ing.reorder_point == null ? null : Number(ing.reorder_point);
    const max = ing.max_stock_level == null ? null : Number(ing.max_stock_level);
    if (claims.branch_id) {
      const entry = qtyByKey.get(`${ing.id}`);
      const qty = entry?.qty ?? 0;
      rows.push({
        ingredientId: ing.id,
        name: ing.name,
        sku: ing.sku,
        unit: ing.unit,
        category: ing.category,
        quantity: qty,
        minLevel: min,
        reorderPoint: reorder,
        maxLevel: max,
        status: classifyStatus(qty, min, max),
        branchId: claims.branch_id,
        branchName: branchById.get(claims.branch_id) ?? "—",
      });
    } else {
      const branchEntries = Array.from(qtyByKey.entries()).filter(([k]) =>
        k.startsWith(`${ing.id}:`),
      );
      const totalQty = branchEntries.reduce((s, [, v]) => s + v.qty, 0);
      rows.push({
        ingredientId: ing.id,
        name: ing.name,
        sku: ing.sku,
        unit: ing.unit,
        category: ing.category,
        quantity: totalQty,
        minLevel: min,
        reorderPoint: reorder,
        maxLevel: max,
        status: classifyStatus(totalQty, min, max),
        branchId: null,
        branchName: "Tất cả kho",
      });
    }
  }

  rows.sort((a, b) => {
    const order: Record<StockRow["status"], number> = {
      out: 0,
      low: 1,
      normal: 2,
      over: 3,
    };
    if (order[a.status] !== order[b.status]) {
      return order[a.status] - order[b.status];
    }
    return a.name.localeCompare(b.name, "vi");
  });

  const branchLabel = claims.branch_id
    ? (branchById.get(claims.branch_id) ?? "Kho của bạn")
    : "Tất cả kho";

  if (rows.length === 0) {
    return (
      <MobilePage>
        <MobileSectionHeader
          backHref="/inventory/m"
          backLabel="Trang chính"
          eyebrow="Tồn kho"
          title={branchLabel}
        />
        <MobileEmptyState
          icon={Package}
          title="Chưa có dữ liệu tồn kho"
          description="Thêm nguyên liệu và ghi nhận phiếu nhập để xem tồn kho tại đây."
        />
      </MobilePage>
    );
  }

  return (
    <MobilePage>
      <MobileSectionHeader
        backHref="/inventory/m"
        backLabel="Trang chính"
        eyebrow="Tồn kho"
        title={branchLabel}
        description="Sắp xếp theo mức độ cần xử lý."
      />

      <MobileStockClient rows={rows} />
    </MobilePage>
  );
}
