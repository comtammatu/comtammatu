import { notFound, redirect } from "next/navigation";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { messages } from "@lib/messages";
import {
  PosSessionDetailClient,
  type PosSessionOrder,
} from "../pos-sessions-client";
import { normalizeOrderRows, normalizeSessionRows } from "../_lib/normalize";

export default async function BranchPosSessionDetailPage({
  params,
}: {
  params: Promise<{ branchId: string; sessionId: string }>;
}) {
  const { branchId: branchIdStr, sessionId: sessionIdStr } = await params;
  const branchId = Number(branchIdStr);
  const sessionId = Number(sessionIdStr);
  if (
    !Number.isInteger(branchId) ||
    branchId <= 0 ||
    !Number.isInteger(sessionId) ||
    sessionId <= 0
  ) {
    notFound();
  }

  const { supabase, claims } = await loadAuthState();

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect(`/br/${branchId}/settings`);
  }

  if (!(await canAccessBranch(supabase, claims, branchId))) {
    notFound();
  }

  const [{ data: branch, error: branchError }, { data: session, error }] =
    await Promise.all([
      supabase
        .from("branches")
        .select("id")
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
        .eq("id", sessionId)
        .eq("branch_id", branchId)
        .eq("tenant_id", claims.tenant_id)
        .maybeSingle(),
    ]);

  if (branchError || !branch) notFound();
  if (error) throw new Error(messages.settings.branch.posSessionsLoadFailed);
  if (!session) notFound();

  const [sessionRow] = normalizeSessionRows([session]);
  if (!sessionRow) notFound();

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
    .eq("pos_session_id", sessionId)
    .order("created_at", { ascending: false });

  if (orderError) {
    throw new Error(messages.settings.branch.posSessionBillsLoadFailed);
  }
  const orders: PosSessionOrder[] = normalizeOrderRows(orderRows);

  return (
    <BranchOperatorPage
      title={messages.settings.pages.posSessionsTitle}
      backHref={`/br/${branchId}/pos-sessions`}
      backLabel={messages.settings.pages.posSessionsTitle}
    >
      <PosSessionDetailClient
        branchId={branchId}
        session={sessionRow}
        orders={orders}
      />
    </BranchOperatorPage>
  );
}
