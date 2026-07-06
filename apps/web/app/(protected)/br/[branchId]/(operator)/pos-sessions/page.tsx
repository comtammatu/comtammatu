import { notFound, redirect } from "next/navigation";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { EmployeePage } from "@lib/employee/components/employee-page";
import { loadAuthState } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { messages } from "@lib/messages";
import { PosSessionsClient, type PosSessionOrder } from "./pos-sessions-client";
import { getPosSessionReport, type PosSessionReport } from "./report-actions";
import {
  normalizeOrderRows,
  normalizeSessionRows,
  resolveSelectedSessionId,
} from "./_lib/normalize";

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
          variance_approver_user_id,
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

  const sessionRows = normalizeSessionRows(sessions);

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
          modifiers,
          sides,
          note,
          status
        )
      `,
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("pos_session_id", selectedSessionId)
      .order("created_at", { ascending: false });

    if (orderError) throw new Error("Không thể tải bill của ca POS");
    orders = normalizeOrderRows(orderRows);

    const reportResult = await getPosSessionReport(selectedSessionId);
    if (reportResult.success && reportResult.data) {
      report = reportResult.data;
    }
  }
  return (
    <EmployeePage
      title={messages.settings.pages.posSessionsTitle}
      description={messages.settings.pages.posSessionsDescription}
    >
      <PosSessionsClient
        branchId={branchId}
        sessions={sessionRows}
        selectedSessionId={selectedSessionId}
        orders={orders}
        report={report}
      />
    </EmployeePage>
  );
}
