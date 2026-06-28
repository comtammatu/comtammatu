import { notFound } from "next/navigation";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { formatVNLongDate } from "@comtammatu/shared/time";
import { AppPage, AppSection } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchSwitcherOptions } from "@/_lib/branch-scope";
import { messages } from "@lib/messages";
import { BranchManagementShell } from "../../_components/branch-management-chrome";
import { fetchBranchMenuDailyLimits } from "./actions";
import { MenuLimitsTable } from "./menu-limits-table";

export const dynamic = "force-dynamic";

export default async function BranchMenuLimitsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    notFound();
  }

  const { supabase, claims, session } = await loadAuthState();

  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, branch_kind, is_active")
    .eq("id", branchId)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!branch || !branch.is_active) notFound();

  const branchOptions = await resolveBranchSwitcherOptions(supabase, claims);

  const result = await fetchBranchMenuDailyLimits(branchId);
  const rows = result.success && result.data ? result.data : [];

  const today = formatVNLongDate(new Date());

  const displayName =
    session.user.user_metadata?.["full_name"] ??
    session.user.email ??
    claims.user_role;

  return (
    <BranchManagementShell
      user={{ name: displayName }}
      role={claims.user_role}
      branchId={branchId}
      branchName={branch.name}
      branchOptions={branchOptions}
      defaultPageTitle={messages.settings.branch.menuLimitsTitle}
      description={`${branch.name} · ${today}`}
      breadcrumbSegments={[
        { label: APP_COPY_VI.branchCommand, href: `/br/${branchId}/dashboard` },
        {
          label: messages.settings.branch.hubTitle,
          href: `/br/${branchId}/settings`,
        },
        messages.settings.branch.menuLimitsTitle,
      ]}
    >
      <AppPage width="default">
        <AppSection tone="info" size="sm">
          <p>
            {messages.settings.branch.menuLimitsIntroBefore}{" "}
            <span className="font-medium text-foreground">
              {messages.settings.branch.menuLimitsDisabledAction}
            </span>{" "}
            {messages.settings.branch.menuLimitsIntroAfter}
          </p>
          <p className="mt-1">{messages.settings.branch.menuLimitsResetNote}</p>
          {!result.success ? (
            <p className="mt-2 text-destructive">
              {result.error ?? messages.settings.branch.menuLimitsLoadFailed}
            </p>
          ) : null}
        </AppSection>

        <MenuLimitsTable branchId={branchId} rows={rows} />
      </AppPage>
    </BranchManagementShell>
  );
}
