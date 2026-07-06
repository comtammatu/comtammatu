import { notFound, redirect } from "next/navigation";
import { canAccess } from "@comtammatu/shared/auth";
import { AppEmptyState, AppPageHeader } from "@/components/surface";
import { AppPageTabs } from "@/components/app-page-tabs";
import { TabsContent } from "@comtammatu/ui/components/tabs";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../_lib/parse-branch-id";
import { fetchTeamBoard, type TeamBoardRow } from "./data";
import { TeamBoardClient } from "./team-board-client";
import { TeamAssignmentsContent } from "./assignments/assignments-content";
import { TeamMembersContent } from "./members/members-content";

const copy = messages.employee.teamBoard;

export default async function TeamBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const activeTab = resolvedSearchParams.tab ?? "board";

  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  if (!canAccess(claims.user_role, "branch_team")) {
    return (
      <>
        <AppPageHeader
          title={copy.title}
          className="sr-only sm:not-sr-only"
        />
        <AppEmptyState mode="no-access" />
      </>
    );
  }

  // Ensure valid tab
  if (activeTab !== "board" && activeTab !== "assignments" && activeTab !== "members") {
    redirect(`/br/${context.branchId}/team?tab=board`);
  }

  const result = await fetchTeamBoard({ branchId: context.branchId });
  const rows: TeamBoardRow[] = result.success ? (result.data?.rows ?? []) : [];
  const basePath = `/br/${context.branchId}`;

  const tabsList = [
    { value: "board", label: "Tình trạng hôm nay" },
    { value: "members", label: "Nhân sự" },
    { value: "assignments", label: "Phân công" },
  ];

  const content = (
    <AppPageTabs items={tabsList} defaultValue={activeTab}>
      <TabsContent value="board" className="mt-0">
        {result.success ? (
          <TeamBoardClient
            rows={rows}
            countSlipsHref={`${basePath}/stock/count-slips`}
            checkoutApprovalsHref={`${basePath}/shift/checkout-approvals`}
          />
        ) : (
          <AppEmptyState mode="error" description={result.error} />
        )}
      </TabsContent>
      <TabsContent value="members" className="mt-0">
        <TeamMembersContent branchId={context.branchId} />
      </TabsContent>
      <TabsContent value="assignments" className="mt-0">
        <TeamAssignmentsContent branchId={context.branchId} />
      </TabsContent>
    </AppPageTabs>
  );

  return (
    <>
      <AppPageHeader
        title={copy.title}
        description={copy.description}
        className="sr-only sm:not-sr-only"
        tabs={content}
      />
      <div className="sm:hidden">{content}</div>
    </>
  );
}
