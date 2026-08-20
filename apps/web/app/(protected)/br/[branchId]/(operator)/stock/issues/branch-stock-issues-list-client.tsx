"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronRight as IconChevronRight,
  CirclePlus as IconCirclePlus,
  FileText as IconFileText,
  Search as IconSearch,
} from "lucide-react";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { AppEmptyState } from "@/components/surface";
import { StatusBadge, getStatusBadgeMeta } from "@/components/status-badge";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  filterBranchStockIssues,
  type BranchStockIssue,
  type BranchStockIssuePermissions,
  type BranchStockIssueStatusFilter,
  type BranchStockIssueType,
} from "@lib/inventory/stock-issue-model";

const statusOptions: Array<{
  value: BranchStockIssueStatusFilter;
  label: string;
}> = [
  { value: "all", label: INVENTORY_VI.allStatusesOption },
  {
    value: "draft",
    label: getStatusBadgeMeta("inventory", "draft").label,
  },
  {
    value: "confirmed",
    label: getStatusBadgeMeta("inventory", "confirmed").label,
  },
  {
    value: "cancelled",
    label: getStatusBadgeMeta("inventory", "cancelled").label,
  },
];

function issueTypeLabel(type: BranchStockIssueType) {
  if (type === "writeoff") return INVENTORY_VI.issueTypeWriteoff;
  return INVENTORY_VI.issueTypeConsumption;
}

export function BranchStockIssuesListClient({
  branchId,
  branchName,
  issues,
  permissions,
}: {
  branchId: number;
  branchName: string;
  issues: BranchStockIssue[];
  permissions: BranchStockIssuePermissions;
}) {
  const stockBasePath = `/br/${branchId}/stock`;
  const issuesBasePath = `${stockBasePath}/issues`;
  const wasteHref = `${stockBasePath}/waste`;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BranchStockIssueStatusFilter>("all");
  const canCreateWaste = permissions.canCreateWriteoff;
  const filteredIssues = useMemo(
    () => filterBranchStockIssues(issues, { query: search, status }),
    [issues, search, status],
  );
  const hasFilter = search.trim().length > 0 || status !== "all";

  return (
    <BranchOperatorPage
      title={INVENTORY_VI.issueSlipsTitle}
      description={branchName}
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        {canCreateWaste ? (
          <Button
            size="touch"
            className="w-full"
            render={<Link href={wasteHref} />}
          >
            <IconCirclePlus data-icon="inline-start" />
            {INVENTORY_VI.issueCreateAction}
          </Button>
        ) : null}

        <BranchOperatorPanel
          title={INVENTORY_VI.issueSlipsTitle}
          description={INVENTORY_VI.issueEmptyDescription}
          icon={IconFileText}
          size="sm"
          contentClassName="gap-3"
        >
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <InputGroup className="min-h-12 min-w-0 flex-1">
              <InputGroupAddon>
                <IconSearch />
              </InputGroupAddon>
              <InputGroupInput
                aria-label={INVENTORY_VI.issueSearchPlaceholder}
                autoComplete="off"
                inputMode="search"
                name="branch-stock-issue-search"
                placeholder={INVENTORY_VI.issueSearchPlaceholder}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </InputGroup>
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus(value as BranchStockIssueStatusFilter)
              }
            >
              <SelectTrigger
                aria-label={INVENTORY_VI.allStatusesOption}
                size="touch"
                className="w-full sm:w-auto sm:min-w-48"
              >
                <SelectValue placeholder={INVENTORY_VI.allStatusesOption} />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    size="touch"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {issues.length > 0 ? (
            <Badge variant="outline" className="w-fit rounded-full">
              {filteredIssues.length}/{issues.length}
            </Badge>
          ) : null}

          {filteredIssues.length === 0 ? (
            <AppEmptyState
              compact
              mode={hasFilter ? "no-results" : "no-data"}
              icon={<IconFileText />}
              title={
                hasFilter
                  ? INVENTORY_VI.issueEmptyFiltered
                  : INVENTORY_VI.issueEmptyNoData
              }
              description={
                hasFilter ? undefined : INVENTORY_VI.issueEmptyDescription
              }
            />
          ) : (
            <ItemGroup className="gap-2" role="list">
              {filteredIssues.map((issue) => (
                <div key={issue.id} role="listitem">
                  <Item
                    variant="outline"
                    className={
                      issue.status === "cancelled"
                        ? "min-h-16 min-w-0 flex-nowrap touch-manipulation opacity-60"
                        : "min-h-16 min-w-0 flex-nowrap touch-manipulation"
                    }
                    render={<Link href={`${issuesBasePath}/${issue.id}`} />}
                  >
                    <ItemContent className="min-w-0 gap-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <ItemTitle className="truncate font-mono text-sm font-semibold">
                          {issue.code}
                        </ItemTitle>
                        <StatusBadge
                          domain="inventory"
                          value={issue.status}
                          size="sm"
                        />
                      </div>
                      <ItemDescription className="line-clamp-none flex flex-wrap gap-x-2 gap-y-1 text-xs">
                        <span>{issueTypeLabel(issue.type)}</span>
                        <span>{formatVNDateTime(issue.issuedAt)}</span>
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="self-center text-muted-foreground">
                      <IconChevronRight />
                    </ItemActions>
                  </Item>
                </div>
              ))}
            </ItemGroup>
          )}
        </BranchOperatorPanel>
      </div>
    </BranchOperatorPage>
  );
}
