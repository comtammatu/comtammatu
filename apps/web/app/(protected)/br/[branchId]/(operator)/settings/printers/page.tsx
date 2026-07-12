import { notFound, redirect } from "next/navigation";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import {
  PrintersClient,
  type Category,
  type Printer,
} from "@/(protected)/branch-settings/_shared/printers/printers-client";
import { attachPrinterRouting } from "./_lib/printer-routing";

export default async function BranchPrintersPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    notFound();
  }

  const { supabase, claims } = await loadAuthState();

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect(`/br/${branchId}/settings`);
  }

  const [
    branchRes,
    printersRes,
    agentRes,
    printTypesRes,
    categoryRoutesRes,
    categoriesRes,
  ] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name")
      .eq("id", branchId)
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_kind", "branch")
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("printers")
      .select(
        "id, branch_id, role, name, lan_host, lan_port, paper_width_mm, code_page, is_active",
      )
      .eq("branch_id", branchId)
      .order("role"),
    supabase
      .from("printer_agent_status")
      .select("branch_id, agent_id, version, last_seen_at, is_online")
      .eq("branch_id", branchId),
    supabase
      .from("printer_print_types")
      .select("branch_id, printer_id, print_type")
      .eq("branch_id", branchId),
    supabase
      .from("printer_menu_categories")
      .select("branch_id, printer_id, category_id")
      .eq("branch_id", branchId),
    supabase
      .from("menu_categories")
      .select("id, name, type, sort_order")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
  ]);

  if (branchRes.error || !branchRes.data) notFound();
  if (printersRes.error)
    throw new Error(messages.settings.printers.loadPrintersFailed);
  if (agentRes.error)
    throw new Error(messages.settings.printers.loadAgentStatusFailed);
  if (printTypesRes.error)
    throw new Error(messages.settings.printers.loadPrintTypesFailed);
  if (categoryRoutesRes.error)
    throw new Error(messages.settings.printers.loadCategoryRoutesFailed);
  if (categoriesRes.error)
    throw new Error(messages.settings.printers.loadCategoriesFailed);

  const printers = attachPrinterRouting(
    printersRes.data ?? [],
    printTypesRes.data ?? [],
    categoryRoutesRes.data ?? [],
  );

  return (
    <BranchOperatorPage
      title={messages.settings.pages.printersTitle}
      description={messages.settings.branch.printersDescription(
        branchRes.data.name,
      )}
      badge={{
        children: (agentRes.data ?? [])[0]?.is_online
          ? messages.settings.branch.readinessPrinterOnlineBadge
          : messages.settings.branch.readinessPrinterOfflineBadge,
        variant: (agentRes.data ?? [])[0]?.is_online ? "success" : "outline",
      }}
      backHref={`/br/${branchId}/settings`}
      backLabel={messages.settings.branch.settingsBack}
    >
      <PrintersClient
        branch={branchRes.data}
        printers={printers as Printer[]}
        categories={(categoriesRes.data ?? []) as Category[]}
      />
    </BranchOperatorPage>
  );
}
