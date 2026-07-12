import { canAccess } from "@comtammatu/shared/auth";
import { BranchOperatorPanel } from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { BranchReadinessList } from "../../dashboard/_components/command-sections";
import { buildReadinessItems } from "../../dashboard/_lib/command-config";
import { fetchBranchDayStatus } from "../../dashboard/data";

export async function HubReadinessSection({
  branchId,
}: {
  branchId: number;
}) {
  const { supabase, claims } = await loadAuthState();
  const role = claims.user_role;
  const day = await fetchBranchDayStatus(supabase, claims, branchId);
  const basePath = `/br/${branchId}`;
  const settingsHref = canAccess(role, "branch_settings")
    ? `${basePath}/settings`
    : undefined;
  const tablesHref = settingsHref ? `${settingsHref}/tables` : undefined;
  const posSettingsHref = settingsHref ? `${settingsHref}/pos` : undefined;
  const copy = messages.settings.branch;
  const items = buildReadinessItems(day, copy, {
    menuHref: canAccess(role, "branch_menu_limits")
      ? `${basePath}/menu-limits`
      : undefined,
    floorHref:
      day.tablesTotal <= 0
        ? tablesHref
        : day.setupActiveTerminals <= 0
          ? posSettingsHref
          : settingsHref,
    kdsSettingsHref: settingsHref ? `${settingsHref}/kds` : undefined,
    posHref: canAccess(role, "pos") ? `${basePath}/pos` : undefined,
    kdsHref: canAccess(role, "kds") ? `${basePath}/kds` : undefined,
    printersHref: settingsHref ? `${settingsHref}/printers` : undefined,
    staffHref: canAccess(role, "branch_team")
      ? `${basePath}/team`
      : undefined,
    settingsHref,
    checkoutApprovalsHref: canAccess(role, "employee_checkout_approvals")
      ? `${basePath}/shift/checkout-approvals`
      : undefined,
  });

  return (
    <BranchOperatorPanel
      title={copy.readinessTitle}
      description={copy.readinessDescription}
      size="sm"
    >
      <BranchReadinessList items={items} />
    </BranchOperatorPanel>
  );
}
