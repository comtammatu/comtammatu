import { notFound, redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import {
  currentUserHasPermissionAny,
} from "@/_lib/permissions";
import { canAccess, PERMISSION_KEYS } from "@comtammatu/shared/auth";

import { resolveInventoryBranchScope } from "../_lib/inventory-scope";

import { GRNListPageContent } from "../grn/page";
import { IssuesPageContent } from "../issues/page";
import { TransfersPageContent } from "../transfers/page";

import { AppPage, AppPageHeader } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";

interface OperationsPageProps {
  searchParams: Promise<{
    tab?: string;
    branchId?: string | string[];
    startDate?: string | string[];
    endDate?: string | string[];
  }>;
}

export default async function OperationsPage({
  searchParams,
}: OperationsPageProps) {
  const params = await searchParams;
  const { supabase, claims } = await loadAuthState();
  await resolveInventoryBranchScope(supabase, claims, null);
  const isOwner = claims.user_role === "owner";
  const eyebrowText = "Kho hàng";
  const titleText = "Giao dịch kho";

  const [hasProcurementRead] =
    await Promise.all([
      currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ),
    ]);

  const showProcurement =
    isOwner ||
    (canAccess(claims.user_role, "branch_stock") &&
      hasProcurementRead);

  // Compute allowed tabs based on permissions
  const tabsList: Array<{ value: string; label: string }> = [];

  if (showProcurement) {
    tabsList.push({ value: "grn", label: "Phiếu nhập kho" });
  }

  tabsList.push({ value: "consumption", label: "Tiêu hao vận hành" });
  tabsList.push({ value: "issues", label: "Sự cố kho" });

  tabsList.push({ value: "transfers", label: "Điều chuyển nội bộ" });

  if (tabsList.length === 0) {
    notFound();
  }

  // Determine active tab
  const activeTab =
    params.tab && tabsList.some((t) => t.value === params.tab)
      ? params.tab
      : (tabsList[0]?.value ?? "issues");

  // Redirect if URL tab is missing or invalid to ensure clean SEO and browser states
  if (params.tab !== activeTab) {
    const qParams = new URLSearchParams();
    qParams.set("tab", activeTab);
    if (params.branchId) {
      if (Array.isArray(params.branchId)) {
        params.branchId.forEach((id) => qParams.append("branchId", id));
      } else {
        qParams.set("branchId", params.branchId);
      }
    }
    redirect(`/inventory/operations?${qParams.toString()}`);
  }

  // Render tab content on demand
  let tabContent = null;
  if (activeTab === "grn") {
    tabContent = (
      <GRNListPageContent
        searchParams={searchParams}
        embedded={true}
        basePath="/inventory/grn"
      />
    );
  } else if (activeTab === "consumption") {
    tabContent = (
      <IssuesPageContent
        searchParams={searchParams}
        scope="consumption"
        listBasePath="/inventory/consumption"
        embedded={true}
      />
    );
  } else if (activeTab === "issues") {
    tabContent = (
      <IssuesPageContent
        searchParams={searchParams}
        scope="internal"
        listBasePath="/inventory/issues"
        embedded={true}
      />
    );
  } else if (activeTab === "transfers") {
    tabContent = (
      <TransfersPageContent
        searchParams={searchParams}
        embedded={true}
        basePath="/inventory/transfers"
      />
    );
  }

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader eyebrow={eyebrowText} title={titleText} />
      <AppPageTabs items={tabsList} defaultValue={activeTab}>
        <TabsContent value={activeTab} className="mt-0">
          {tabContent}
        </TabsContent>
      </AppPageTabs>
    </AppPage>
  );
}
