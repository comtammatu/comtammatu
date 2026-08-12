"use client";

import { useRouter } from "next/navigation";
import { Building2 as IconBuilding } from "lucide-react";
import { getSiteKindLabelVi } from "@comtammatu/shared/labels";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppEmptyState, AppListFrame } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { messages } from "@lib/messages";
import type { BranchOption } from "../_types";
import {
  withHrBranchScope,
  type HrBranchScope,
} from "@/lib/hr-scope";

type RosterSiteRow = {
  scope: Exclude<HrBranchScope, "all">;
  name: string;
  kind: string;
};

function rosterSiteHref(
  scope: Exclude<HrBranchScope, "all">,
  week?: string,
): string {
  const href = withHrBranchScope("/hr/attendance?tab=roster", scope);
  if (!week) return href;
  const [pathname, query = ""] = href.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("week", week);
  return `${pathname}?${params.toString()}`;
}

export function RosterSiteList({
  branches,
  week,
}: {
  branches: BranchOption[];
  week?: string;
}) {
  const router = useRouter();
  const copy = messages.hr.roster;
  const rows: RosterSiteRow[] = [
    {
      scope: "office",
      name: copy.officeSiteLabel,
      kind: copy.officeSiteLabel,
    },
    ...branches.map((branch) => ({
      scope: String(branch.id) as `${number}`,
      name: branch.name,
      kind: getSiteKindLabelVi(branch.branch_kind ?? "branch"),
    })),
  ];

  const columns: DataTableColumn<RosterSiteRow>[] = [
    {
      key: "name",
      header: copy.siteListColumnSite,
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: "kind",
      header: copy.siteListColumnKind,
      render: (row) => (
        <span className="text-muted-foreground">{row.kind}</span>
      ),
    },
  ];

  return (
    <AppListFrame
      title={copy.siteListTitle}
      description={copy.siteListDescription}
      contentScroll
    >
      {rows.length === 0 ? (
        <AppEmptyState
          mode="no-data"
          title={copy.siteListEmptyTitle}
          icon={<IconBuilding />}
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(row) => row.scope}
          onRowClick={(row) => router.push(rosterSiteHref(row.scope, week))}
          mobileCardRender={(row) => (
            <Item variant="outline">
              <ItemContent>
                <ItemTitle size="heading" className="line-clamp-none">
                  {row.name}
                </ItemTitle>
                <ItemDescription className="line-clamp-none">
                  {row.kind}
                </ItemDescription>
              </ItemContent>
            </Item>
          )}
        />
      )}
    </AppListFrame>
  );
}
