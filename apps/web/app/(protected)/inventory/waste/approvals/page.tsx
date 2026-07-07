import { notFound, redirect } from "next/navigation";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "@/(protected)/inventory/_lib/auth";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import {
  WasteApprovalsClient,
  type PendingWasteRow,
} from "./waste-approvals-client";

export const dynamic = "force-dynamic";

interface WasteApprovalsPageContentProps {
  searchParams?: Promise<{ branchId?: string }>;
  routeBranchId?: number;
  embedded?: boolean;
}

export async function WasteApprovalsPageContent({
  searchParams,
  routeBranchId,
  embedded = false,
}: WasteApprovalsPageContentProps) {
  const params = searchParams ? await searchParams : {};

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_WASTE_APPROVE,
    routeBranchId,
  );
  if (!ctx) redirect("/");
  const { supabase, claims, user } = ctx;

  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId: params.branchId,
  });
  if (scope.outOfScope) notFound();
  const branchFilter = scope.selectedBranchId;

  // Fetch pending waste issues + their items + ingredient names
  let query = supabase
    .from("stock_issues")
    .select(
      `
      id,
      issue_number,
      branch_id,
      source_location_id,
      issued_at,
      shift_key,
      source_type,
      created_by,
      notes
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("issue_type", "writeoff")
    .eq("approval_status", "pending")
    .order("issued_at", { ascending: true });

  if (branchFilter !== null) {
    query = query.eq("branch_id", branchFilter);
  }
  const { data: issues } = await query;

  const issueIds = (issues ?? []).map((i) => i.id);
  const branchIds = Array.from(
    new Set((issues ?? []).map((i) => i.branch_id).filter(Boolean)),
  );
  const creatorIds = Array.from(
    new Set(
      (issues ?? []).map((i) => i.created_by).filter(Boolean) as string[],
    ),
  );

  const [itemsRes, branchesRes, creatorsRes] = await Promise.all([
    issueIds.length > 0
      ? supabase
          .from("stock_issue_items")
          .select(
            `
            id,
            issue_id,
            ingredient_id,
            quantity,
            unit_cost,
            total_cost,
            reason_code,
            photo_urls,
            waste_tier,
            qty_ratio,
            rolling_15min_sum,
            ingredient:ingredients(id, name),
            unit_obj:units!stock_issue_items_entry_unit_id_fkey(code)
          `,
          )
          .in("issue_id", issueIds)
      : Promise.resolve({ data: [] as never[] }),
    branchIds.length > 0
      ? supabase.from("branches").select("id, name").in("id", branchIds)
      : Promise.resolve({ data: [] as never[] }),
    creatorIds.length > 0
      ? supabase.from("profiles").select("id, full_name").in("id", creatorIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const branchMap = new Map<number, string>();
  for (const b of branchesRes.data ?? []) branchMap.set(b.id, b.name);

  const creatorMap = new Map<string, string>();
  for (const p of creatorsRes.data ?? []) {
    if (p.id) creatorMap.set(p.id, p.full_name ?? p.id);
  }

  type ItemRow = NonNullable<typeof itemsRes.data>[number];
  const itemsByIssue = new Map<number, ItemRow[]>();
  for (const it of (itemsRes.data ?? []) as ItemRow[]) {
    const list = itemsByIssue.get(it.issue_id) ?? [];
    list.push(it);
    itemsByIssue.set(it.issue_id, list);
  }

  const rows: PendingWasteRow[] = (issues ?? []).map((si) => {
    const items = itemsByIssue.get(si.id) ?? [];
    const total = items.reduce(
      (sum, it) => sum + Number(it.total_cost ?? 0),
      0,
    );
    const creatorId = si.created_by ?? "";
    return {
      issueId: si.id,
      issueNumber: si.issue_number,
      branchId: si.branch_id,
      branchName: branchMap.get(si.branch_id) ?? `CN #${si.branch_id}`,
      issuedAt: si.issued_at,
      shiftKey: si.shift_key ?? "",
      sourceType: si.source_type ?? "manual",
      createdBy: creatorId,
      createdByName: creatorMap.get(creatorId) ?? creatorId,
      isSelfCreated: creatorId === user.id,
      totalValue: total,
      notes: si.notes ?? null,
      items: items.map((it) => {
        const ingredient = Array.isArray(it.ingredient)
          ? it.ingredient[0]
          : it.ingredient;
        return {
          itemId: it.id,
          ingredientId: it.ingredient_id,
          ingredientName: ingredient?.name ?? `#${it.ingredient_id}`,
          quantity: Number(it.quantity),
          unit: (it as any).unit_obj?.code ?? "",
          unitCost: it.unit_cost !== null ? Number(it.unit_cost) : null,
          totalCost: it.total_cost !== null ? Number(it.total_cost) : 0,
          reasonCode: it.reason_code ?? "",
          photoUrls: (it.photo_urls ?? []) as string[],
          wasteTier: it.waste_tier,
          qtyRatio: it.qty_ratio !== null ? Number(it.qty_ratio) : null,
          rolling15MinSum:
            it.rolling_15min_sum !== null ? Number(it.rolling_15min_sum) : null,
        };
      }),
    };
  });

  return (
    <WasteApprovalsClient
      initial={rows}
      branchFilter={branchFilter}
      embedded={embedded}
    />
  );
}

export default async function WasteApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  return <WasteApprovalsPageContent searchParams={searchParams} />;
}
