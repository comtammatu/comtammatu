import { notFound } from "next/navigation";
import {
  resolveOperatorTiles,
  type BranchKind,
} from "@comtammatu/shared/auth";
import {
  EmployeeActionSection,
  EmployeePage,
} from "@lib/employee/components/employee-page";
import { AppEmptyState } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../_lib/parse-branch-id";
import { getOperatorMoreGroups } from "../_lib/operator-home-contract";
import { resolveOperatorTileIcon } from "../operator-tile-icons";

export default async function OperatorMorePage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  const branchKind = context.branch.branch_kind as BranchKind;
  const groups = getOperatorMoreGroups(
    resolveOperatorTiles(claims.user_role, context.branchId, branchKind),
    branchKind,
  );
  const copy = messages.settings.branch;

  return (
    <EmployeePage
      title={copy.centralMoreTitle}
      description={copy.centralMoreDescription}
      hideHeaderOnMobile
    >
      {groups.length > 0 ? (
        groups.map((group) => (
          <EmployeeActionSection
            key={group.id}
            title={group.title}
            links={group.tiles.map((tile) => ({
              key: `${group.id}-${tile.moduleKey}-${tile.href}`,
              href: tile.href,
              icon: resolveOperatorTileIcon(tile.icon),
              title: tile.label,
            }))}
            columns={2}
            mobileColumns={2}
            wideColumns
          />
        ))
      ) : (
        <AppEmptyState
          title={copy.moreEmptyTitle}
          description={copy.moreEmptyDescription}
          compact
        />
      )}
    </EmployeePage>
  );
}
