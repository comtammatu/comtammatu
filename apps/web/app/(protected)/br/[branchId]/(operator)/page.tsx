import {
  ChefHat,
  LayoutDashboard,
  ListChecks,
  Monitor,
  MonitorUp,
  Package,
  Settings,
  Utensils,
} from "lucide-react";
import { notFound } from "next/navigation";
import { resolveOperatorTiles } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import {
  EmployeeActionSection,
  EmployeePage,
} from "@/(protected)/employee/components/employee-page";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";

const ICONS = {
  ChefHat,
  LayoutDashboard,
  ListChecks,
  Monitor,
  MonitorUp,
  Package,
  Settings,
  Utensils,
} as const;

function parseBranchId(raw: string): number | null {
  const branchId = Number(raw);
  return Number.isInteger(branchId) && branchId > 0 ? branchId : null;
}

export default async function OperatorHomePage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  const groups = resolveOperatorTiles(claims.user_role, context.branchId);

  return (
    <EmployeePage title={APP_COPY_VI.operatorHome} hideHeaderOnMobile>
      {groups.map((group) => (
        <EmployeeActionSection
          key={group.id}
          title={group.title}
          links={group.tiles.map((tile) => {
            const Icon = ICONS[tile.icon as keyof typeof ICONS] ?? Monitor;
            return {
              key: `${group.id}-${tile.moduleKey}`,
              href: tile.href,
              icon: Icon,
              title: tile.label,
            };
          })}
        />
      ))}
    </EmployeePage>
  );
}
