import { notFound } from "next/navigation";
import { PROCUREMENT_ROLES, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { fetchIngredients } from "../../ingredient-actions";
import { fetchPurchaseOrderDetail } from "../../procurement-actions";
import { getAuthContextWithPermission } from "../../_lib/auth";
import { formatDate, formatDateTime } from "../../_lib/format";
import { fetchEntityAuditLogs } from "@/_lib/audit";
import { PODetailClient } from "./po-detail-client";
import type { PODetail } from "./po-detail-client";
import type { IngredientRow } from "../../page";

interface PODetailPageContentProps {
  poId: number;
  routeBranchId?: number;
  purchaseOrdersBasePath?: string;
  afterCreateGrnHref?: string;
}

export async function PODetailPageContent({
  poId,
  routeBranchId,
  purchaseOrdersBasePath = "/inventory/purchase-orders",
  afterCreateGrnHref,
}: PODetailPageContentProps) {
  if (!Number.isInteger(poId) || poId <= 0) notFound();

  const [res, ingredientsRes, ctx, auditLogs] = await Promise.all([
    fetchPurchaseOrderDetail(poId),
    fetchIngredients(),
    getAuthContextWithPermission(
      PROCUREMENT_ROLES,
      PERMISSION_KEYS.PROCUREMENT_READ,
    ),
    fetchEntityAuditLogs("purchase_order", poId, 50),
  ]);
  if (!res.success || !res.data) notFound();
  const isOwner = ctx?.claims.user_role === "owner";

  const d = res.data as {
    po: {
      po_number: string;
      display_id: string | null;
      status: string;
      ordered_at: string;
      updated_at: string;
      branch_id: number;
      suppliers: { id: number; name: string } | null;
    };
    lines: Array<{
      id: number;
      ingredient_id: number;
      quantity: number;
      unit: string;
      unit_price_est: number | null;
      line_total: number | null;
      ingredients: {
        id: number;
        name: string;
        unit: string;
        purchase_unit: string | null;
      } | null;
    }>;
  };
  if (routeBranchId != null && d.po.branch_id !== routeBranchId) notFound();

  const supplier = d.po.suppliers as { id: number; name: string } | null;

  const items: PODetail["items"] = (d.lines ?? []).map((l) => {
    const ing = l.ingredients as {
      id: number;
      name: string;
      unit: string;
      purchase_unit: string | null;
    } | null;
    const price = l.unit_price_est != null ? Number(l.unit_price_est) : null;
    const total = Number(l.line_total ?? 0);
    return {
      lineId: l.id,
      ingredientId: l.ingredient_id ?? ing?.id ?? 0,
      name: ing?.name ?? "—",
      sku: "",
      qty: Number(l.quantity ?? 0),
      unit: ing?.purchase_unit || l.unit || ing?.unit || "",
      price,
      total,
      variance: 0,
      trend: "stable" as const,
    };
  });

  const totalAmount = items.reduce((sum, i) => sum + i.total, 0);

  const po: PODetail = {
    id: poId,
    code: d.po.display_id ?? d.po.po_number ?? "",
    status: d.po.status ?? "draft",
    supplier: supplier?.name ?? "—",
    date: d.po.ordered_at ? formatDate(d.po.ordered_at) : "—",
    sentAt: d.po.updated_at ? formatDateTime(d.po.updated_at) : "—",
    total: totalAmount,
    tax: 0,
    grandTotal: totalAmount,
    supplierInfo: {
      address: "—",
      contact: "—",
      payment: "—",
    },
    items,
  };

  const ingredients: IngredientRow[] = ingredientsRes.success
    ? ((ingredientsRes.data ?? []) as IngredientRow[])
    : [];

  return (
    <PODetailClient
      po={po}
      ingredients={ingredients}
      isOwner={isOwner}
      auditLogs={auditLogs}
      purchaseOrdersBasePath={purchaseOrdersBasePath}
      afterCreateGrnHref={afterCreateGrnHref}
    />
  );
}

export default async function PODetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PODetailPageContent poId={Number(id)} />;
}
