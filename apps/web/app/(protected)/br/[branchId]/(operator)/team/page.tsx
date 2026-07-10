import { notFound } from "next/navigation";
import {
  ClipboardCheck as IconClipboardCheck,
  UsersRound as IconUsersRound,
} from "lucide-react";
import { canAccess } from "@comtammatu/shared/auth";
import { AppEmptyState } from "@/components/surface";
import {
  BranchOperatorActionSection,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../_lib/parse-branch-id";
import { fetchTeamBoard, type TeamBoardRow } from "./data";
import { TeamBoardClient } from "./team-board-client";
import { TeamAssignmentsContent } from "./assignments/assignments-content";
import { TeamMembersContent } from "./members/members-content";
import {
  TeamWorkspaceTabs,
  type TeamWorkspaceTabValue,
} from "./team-workspace-tabs";

const copy = messages.operator.teamBoard;
const validTabs = new Set<TeamWorkspaceTabValue>([
  "board",
  "members",
  "assignments",
]);

export default async function TeamBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedTab = resolvedSearchParams.tab;
  const activeTab: TeamWorkspaceTabValue = validTabs.has(
    requestedTab as TeamWorkspaceTabValue,
  )
    ? (requestedTab as TeamWorkspaceTabValue)
    : "board";

  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  if (!canAccess(claims.user_role, "branch_team")) {
    return (
      <BranchOperatorPage title={copy.title}>
        <AppEmptyState mode="no-access" />
      </BranchOperatorPage>
    );
  }

  const result = await fetchTeamBoard({ branchId: context.branchId });
  const rows: TeamBoardRow[] = result.success ? (result.data?.rows ?? []) : [];
  const basePath = `/br/${context.branchId}`;

  const managerEntry = (
    <section
      aria-label={copy.managerEntryAriaLabel}
      className="grid gap-3 lg:grid-cols-2"
    >
      <BranchOperatorActionSection
        title={copy.reviewGroupTitle}
        description={copy.reviewGroupDescription}
        links={[
          {
            key: "checkout-approvals",
            href: `${basePath}/shift/checkout-approvals`,
            icon: IconClipboardCheck,
            title: copy.reviewCheckoutTitle,
            description: copy.reviewCheckoutDescription,
          },
          {
            key: "count-slips",
            href: `${basePath}/stock/count-slips`,
            icon: IconClipboardCheck,
            title: copy.reviewCountTitle,
            description: copy.reviewCountDescription,
          },
          {
            key: "waste-approvals",
            href: `${basePath}/stock/waste-approvals`,
            icon: IconClipboardCheck,
            title: copy.reviewWasteTitle,
            description: copy.reviewWasteDescription,
          },
        ]}
        columns={1}
        tone="warning"
        size="sm"
      />

      <BranchOperatorActionSection
        title={copy.peopleGroupTitle}
        description={copy.peopleGroupDescription}
        links={[
          {
            key: "members",
            href: `${basePath}/team?tab=members`,
            icon: IconUsersRound,
            title: copy.membersEntryTitle,
            description: copy.membersEntryDescription,
          },
          {
            key: "assignments",
            href: `${basePath}/team?tab=assignments`,
            icon: IconUsersRound,
            title: copy.assignmentsEntryTitle,
            description: copy.assignmentsEntryDescription,
          },
        ]}
        columns={1}
        tone="info"
        size="sm"
      />
    </section>
  );

  const content = (
    <TeamWorkspaceTabs
      initialValue={activeTab}
      board={
        result.success ? (
          <TeamBoardClient
            rows={rows}
            branchId={context.branchId}
            countSlipsHref={`${basePath}/stock/count-slips`}
            checkoutApprovalsHref={`${basePath}/shift/checkout-approvals`}
          />
        ) : (
          <AppEmptyState mode="error" description={result.error} />
        )
      }
      members={<TeamMembersContent branchId={context.branchId} />}
      assignments={<TeamAssignmentsContent branchId={context.branchId} />}
    />
  );

  return (
    <BranchOperatorPage
      title={copy.title}
      description={copy.description}
      hideHeaderOnMobile
    >
      {managerEntry}
      {content}
    </BranchOperatorPage>
  );
}
