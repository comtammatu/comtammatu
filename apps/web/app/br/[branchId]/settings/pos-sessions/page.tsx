import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import { canAccessBranch } from "@/admin/_lib/branch-scope";
import { fetchPosPermissionFlags } from "@/br/[branchId]/pos/actions";
import {
  PosSessionsClient,
  type PosSessionOrder,
  type PosSessionRow,
} from "./pos-sessions-client";
import { getPosSessionReport, type PosSessionReport } from "./report-actions";

export default async function BranchPosSessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const [{ branchId: branchIdStr }, sp] = await Promise.all([
    params,
    searchParams,
  ]);
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const { supabase, claims } = await loadAuthState();

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect(`/br/${branchId}/settings`);
  }

  if (!(await canAccessBranch(supabase, claims, branchId))) {
    notFound();
  }

  const [{ data: branch, error: branchError }, { data: sessions, error }] =
    await Promise.all([
      supabase
        .from("branches")
        .select("id, name, is_active")
        .eq("id", branchId)
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("pos_sessions")
        .select(
          `
          id,
          terminal_id,
          opened_by,
          closed_by,
          opened_at,
          closed_at,
          opening_cash,
          closing_cash,
          expected_cash,
          cash_difference,
          status,
          note,
          variance_approval_note,
          pos_terminals!pos_sessions_terminal_id_fkey (
            name
          ),
          opened_by_profile:profiles!pos_sessions_opened_by_fkey (
            full_name
          ),
          closed_by_profile:profiles!pos_sessions_closed_by_fkey (
            full_name
          )
        `,
        )
        .eq("branch_id", branchId)
        .eq("tenant_id", claims.tenant_id)
        .order("opened_at", { ascending: false })
        .limit(50),
    ]);

  if (branchError || !branch) notFound();
  if (error) throw new Error("Không thể tải ca POS");

  const permFlags = await fetchPosPermissionFlags(branchId);

  const sessionRows = ((sessions ?? []) as unknown as PosSessionRow[]).map(
    (session) => ({
      ...session,
      opening_cash: Number(session.opening_cash),
      closing_cash:
        session.closing_cash == null ? null : Number(session.closing_cash),
      expected_cash:
        session.expected_cash == null ? null : Number(session.expected_cash),
      cash_difference:
        session.cash_difference == null ? null : Number(session.cash_difference),
    }),
  );

  const selectedSessionId = resolveSelectedSessionId(sp.session, sessionRows);

  let orders: PosSessionOrder[] = [];
  let report: PosSessionReport | null = null;
  if (selectedSessionId != null) {
    const { data: orderRows, error: orderError } = await supabase
      .from("orders")
      .select(
        `
        id,
        order_number,
        order_type,
        status,
        payment_status,
        payment_method,
        subtotal,
        tax_amount,
        service_charge,
        discount_amount,
        total_amount,
        customer_count,
        note,
        created_at,
        table_id,
        tables (
          number
        ),
        order_items (
          id,
          item_name,
          variant_name,
          quantity,
          unit_price,
          subtotal,
          status
        )
      `,
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("pos_session_id", selectedSessionId)
      .order("created_at", { ascending: false });

    if (orderError) throw new Error("Không thể tải bill của ca POS");
    orders = ((orderRows ?? []) as unknown as PosSessionOrder[]).map((order) => ({
      ...order,
      subtotal: Number(order.subtotal),
      tax_amount: Number(order.tax_amount),
      service_charge: Number(order.service_charge),
      discount_amount: Number(order.discount_amount),
      total_amount: Number(order.total_amount),
      order_items: order.order_items.map((item) => ({
        ...item,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        subtotal: Number(item.subtotal),
      })),
    }));

    const reportResult = await getPosSessionReport(selectedSessionId);
    if (reportResult.success && reportResult.data) {
      report = reportResult.data;
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm" className="gap-1">
          <Link href={`/br/${branchId}/settings`}>
            <IconArrowLeft className="size-4" />
            Thiết lập
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Ca POS</h1>
          <p className="mt-1 text-sm text-muted-foreground">{branch.name}</p>
        </div>
      </div>

      <PosSessionsClient
        branchId={branchId}
        sessions={sessionRows}
        selectedSessionId={selectedSessionId}
        orders={orders}
        report={report}
        canOverrideVariance={permFlags.canOverrideVariance}
      />
    </div>
  );
}

function resolveSelectedSessionId(
  requested: string | undefined,
  sessions: PosSessionRow[],
): number | null {
  if (sessions.length === 0) return null;

  const parsed = requested != null ? Number(requested) : NaN;
  if (
    Number.isInteger(parsed) &&
    sessions.some((session) => session.id === parsed)
  ) {
    return parsed;
  }

  return sessions[0]?.id ?? null;
}
