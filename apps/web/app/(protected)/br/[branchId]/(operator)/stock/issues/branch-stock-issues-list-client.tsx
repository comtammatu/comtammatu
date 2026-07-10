/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  ChevronRight as IconChevronRight,
  CirclePlus as IconCirclePlus,
  FileText as IconFileText,
  Search as IconSearch,
} from "lucide-react";
import { ACTIONS_VI, FORM_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@comtammatu/ui/components/field";
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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { toast } from "@comtammatu/ui/components/sonner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { AppEmptyState } from "@/components/surface";
import { StatusBadge, getStatusBadgeMeta } from "@/components/status-badge";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  filterBranchStockIssues,
  getBranchStockIssueCreateTypes,
  type BranchStockIssue,
  type BranchStockIssuePermissions,
  type BranchStockIssueStatusFilter,
  type BranchStockIssueType,
} from "@lib/inventory/stock-issue-model";
import { messages } from "@lib/messages";
import { createStockIssueDraft } from "@/(protected)/inventory/issue-actions";

const issuesCopy = messages.inventory.issues;

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
  return type === "writeoff"
    ? INVENTORY_VI.issueTypeWriteoff
    : INVENTORY_VI.issueTypeOther;
}

function BranchStockIssueCreateSheet({
  branchId,
  branchName,
  open,
  permissions,
  onOpenChange,
}: {
  branchId: number;
  branchName: string;
  open: boolean;
  permissions: BranchStockIssuePermissions;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const createTypes = getBranchStockIssueCreateTypes(permissions);
  const [issueType, setIssueType] = useState<BranchStockIssueType>(
    permissions.canCreateWriteoff ? "writeoff" : "other",
  );
  const [notes, setNotes] = useState("");

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) setNotes("");
  }

  function handleCreate() {
    if (!createTypes.includes(issueType)) return;

    startTransition(async () => {
      const result = await createStockIssueDraft({
        branchId,
        issueType,
        notes: notes.trim() || undefined,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? issuesCopy.listLoadFailed);
        return;
      }

      const issueId = Number((result.data as { id: number }).id);
      if (!Number.isInteger(issueId) || issueId <= 0) {
        toast.error(issuesCopy.listLoadFailed);
        return;
      }

      toast.success(INVENTORY_VI.issueCreated);
      handleOpenChange(false);
      router.push(`/br/${branchId}/stock/issues/${issueId}`);
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-dvh-95 overflow-y-auto bg-background p-0 text-foreground"
      >
        <SheetHeader>
          <SheetTitle>{INVENTORY_VI.issueCreateAction}</SheetTitle>
          <p className="text-xs text-muted-foreground">{branchName}</p>
        </SheetHeader>

        <div className="p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="branch-stock-issue-type">
                {INVENTORY_VI.issueTypeLabel}
              </FieldLabel>
              <Select
                value={issueType}
                disabled={createTypes.length === 1}
                onValueChange={(value) =>
                  setIssueType(value as BranchStockIssueType)
                }
              >
                <SelectTrigger
                  id="branch-stock-issue-type"
                  size="touch"
                  className="w-full"
                >
                  <SelectValue placeholder={INVENTORY_VI.issueTypeLabel} />
                </SelectTrigger>
                <SelectContent>
                  {createTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {issueTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="branch-stock-issue-notes">
                {FORM_VI.notes}
              </FieldLabel>
              <Textarea
                id="branch-stock-issue-notes"
                rows={3}
                value={notes}
                placeholder={INVENTORY_VI.issueNotesPlaceholder}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
          </FieldGroup>
        </div>

        <SheetFooter>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="touch-lg"
              className="flex-1"
              disabled={isPending}
              onClick={() => handleOpenChange(false)}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="button"
              size="touch-lg"
              className="flex-1"
              disabled={isPending || createTypes.length === 0}
              onClick={handleCreate}
            >
              <IconCirclePlus data-icon="inline-start" />
              {INVENTORY_VI.createSlipAction}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
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
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BranchStockIssueStatusFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const createTypes = getBranchStockIssueCreateTypes(permissions);
  const filteredIssues = useMemo(
    () => filterBranchStockIssues(issues, { query: search, status }),
    [issues, search, status],
  );
  const hasFilter = search.trim().length > 0 || status !== "all";

  return (
    <BranchOperatorPage
      title={INVENTORY_VI.issueSlipsTitle}
      description={branchName}
      hideHeaderOnMobile
      action={
        createTypes.length > 0 ? (
          <Button
            type="button"
            size="touch"
            onClick={() => setCreateOpen(true)}
          >
            <IconCirclePlus data-icon="inline-start" />
            {INVENTORY_VI.issueCreateAction}
          </Button>
        ) : undefined
      }
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3 pb-28">
        <BranchOperatorControlBar className="sm:hidden">
          <Button asChild variant="ghost" size="icon-touch">
            <Link href={stockBasePath} aria-label="Quay lại kho">
              <IconArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {INVENTORY_VI.issueSlipsTitle}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {branchName}
            </p>
          </div>
          {createTypes.length > 0 ? (
            <Button
              type="button"
              size="touch"
              className="shrink-0"
              onClick={() => setCreateOpen(true)}
            >
              {ACTIONS_VI.create}
            </Button>
          ) : null}
        </BranchOperatorControlBar>

        <BranchOperatorPanel
          title={INVENTORY_VI.issueSlipsTitle}
          description={INVENTORY_VI.issueEmptyDescription}
          icon={IconFileText}
          size="sm"
          contentClassName="gap-3"
        >
          <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_12rem]">
            <InputGroup className="min-w-0">
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
                className="w-full"
              >
                <SelectValue placeholder={INVENTORY_VI.allStatusesOption} />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
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
                    asChild
                    variant="outline"
                    className={
                      issue.status === "cancelled"
                        ? "min-h-16 touch-manipulation opacity-60"
                        : "min-h-16 touch-manipulation"
                    }
                  >
                    <Link href={`${issuesBasePath}/${issue.id}`}>
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
                    </Link>
                  </Item>
                </div>
              ))}
            </ItemGroup>
          )}
        </BranchOperatorPanel>
      </div>

      <BranchStockIssueCreateSheet
        branchId={branchId}
        branchName={branchName}
        open={createOpen}
        permissions={permissions}
        onOpenChange={setCreateOpen}
      />
    </BranchOperatorPage>
  );
}
