import { notFound, redirect } from "next/navigation";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { AppPage } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { BranchManagementShell } from "../../_components/branch-management-chrome";
import {
  TerminalsClient,
  type BranchOption,
  type TerminalRow,
} from "@/(protected)/branch-settings/_shared/pos/terminals-client";

export default async function BranchPosSettingsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const { supabase, claims, session } = await loadAuthState();

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect(`/br/${branchId}/settings`);
  }

  const [branchRes, terminalsRes] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, is_active")
      .eq("id", branchId)
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("pos_terminals")
      .select("id, name, branch_id, device_id, is_active")
      .eq("branch_id", branchId)
      .order("name"),
  ]);

  if (branchRes.error || !branchRes.data) notFound();
  if (terminalsRes.error) throw new Error("Không thể tải máy POS");
  const displayName =
    session.user.user_metadata?.["full_name"] ??
    session.user.email ??
    claims.user_role;

  return (
    <BranchManagementShell
      user={{ name: displayName }}
      role={claims.user_role}
      branchId={branchId}
      branchName={branchRes.data.name}
      defaultPageTitle={messages.settings.pages.posTitle}
      description={branchRes.data.name}
      breadcrumbSegments={[
        { label: APP_COPY_VI.branchCommand, href: `/br/${branchId}/dashboard` },
        {
          label: messages.settings.branch.hubTitle,
          href: `/br/${branchId}/settings`,
        },
        messages.settings.pages.posTitle,
      ]}
    >
      <AppPage width="wide">
        <TerminalsClient
          branches={[branchRes.data] as BranchOption[]}
          terminals={(terminalsRes.data ?? []) as TerminalRow[]}
        />
      </AppPage>
    </BranchManagementShell>
  );
}
