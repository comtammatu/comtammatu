import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ClipboardCheck as IconClipboardCheck,
  UsersRound as IconUsersRound,
} from "lucide-react";
import { canAccess } from "@comtammatu/shared/auth";
import { AppEmptyState, AppPageHeader, AppSection } from "@/components/surface";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
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

const copy = messages.employee.teamBoard;
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
      <>
        <AppPageHeader title={copy.title} />
        <AppEmptyState mode="no-access" />
      </>
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
      <AppSection
        title={copy.reviewGroupTitle}
        description={copy.reviewGroupDescription}
        icon={<IconClipboardCheck />}
        tone="warning"
        size="sm"
      >
        <ItemGroup className="gap-2">
          <Item asChild variant="outline" size="sm" className="bg-card">
            <Link href={`${basePath}/shift/checkout-approvals`}>
              <ItemContent>
                <ItemTitle>{copy.reviewCheckoutTitle}</ItemTitle>
                <ItemDescription>
                  {copy.reviewCheckoutDescription}
                </ItemDescription>
              </ItemContent>
            </Link>
          </Item>
          <Item asChild variant="outline" size="sm" className="bg-card">
            <Link href={`${basePath}/stock/count-slips`}>
              <ItemContent>
                <ItemTitle>{copy.reviewCountTitle}</ItemTitle>
                <ItemDescription>{copy.reviewCountDescription}</ItemDescription>
              </ItemContent>
            </Link>
          </Item>
          <Item asChild variant="outline" size="sm" className="bg-card">
            <Link href={`${basePath}/stock/waste-approvals`}>
              <ItemContent>
                <ItemTitle>{copy.reviewWasteTitle}</ItemTitle>
                <ItemDescription>{copy.reviewWasteDescription}</ItemDescription>
              </ItemContent>
            </Link>
          </Item>
        </ItemGroup>
      </AppSection>

      <AppSection
        title={copy.peopleGroupTitle}
        description={copy.peopleGroupDescription}
        icon={<IconUsersRound />}
        tone="info"
        size="sm"
      >
        <ItemGroup className="gap-2">
          <Item asChild variant="outline" size="sm" className="bg-card">
            <Link href={`${basePath}/team?tab=members`}>
              <ItemContent>
                <ItemTitle>{copy.membersEntryTitle}</ItemTitle>
                <ItemDescription>
                  {copy.membersEntryDescription}
                </ItemDescription>
              </ItemContent>
            </Link>
          </Item>
          <Item asChild variant="outline" size="sm" className="bg-card">
            <Link href={`${basePath}/team?tab=assignments`}>
              <ItemContent>
                <ItemTitle>{copy.assignmentsEntryTitle}</ItemTitle>
                <ItemDescription>
                  {copy.assignmentsEntryDescription}
                </ItemDescription>
              </ItemContent>
            </Link>
          </Item>
        </ItemGroup>
      </AppSection>
    </section>
  );

  const content = (
    <TeamWorkspaceTabs
      initialValue={activeTab}
      board={
        result.success ? (
          <TeamBoardClient
            rows={rows}
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
    <>
      <AppPageHeader
        title={copy.title}
        description={copy.description}
        className="sr-only"
      />
      <div className="flex flex-col gap-3">
        {managerEntry}
        {content}
      </div>
    </>
  );
}
