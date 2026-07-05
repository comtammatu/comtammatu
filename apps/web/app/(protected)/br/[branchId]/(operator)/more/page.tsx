import { notFound } from "next/navigation";
import {
  resolveOperatorTiles,
  type BranchKind,
} from "@comtammatu/shared/auth";
import {
  EmployeeActionSection,
  EmployeePage,
} from "@lib/employee/components/employee-page";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../_lib/parse-branch-id";
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

  const groups = resolveOperatorTiles(
    claims.user_role,
    context.branchId,
    context.branch.branch_kind as BranchKind,
  );

  return (
    <EmployeePage title={messages.settings.branch.centralMoreTitle}>
      {groups.map((group) => (
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
      ))}
    </EmployeePage>
  );
}
