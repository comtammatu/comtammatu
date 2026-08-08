"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight as IconChevronRight,
  ClipboardList as IconClipboard,
  History as IconHistory,
  Plus as IconPlus,
  RotateCcw as IconReset,
  Search as IconSearch,
} from "lucide-react";
import { ACTIONS_VI, FORM_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormField } from "@/components/form";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import { getStatusBadgeMeta, StatusBadge } from "@/components/status-badge";
import {
  BranchOperatorDetailList,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { createStockIssueDraft } from "@/(protected)/inventory/issue-actions";
import {
  filterBranchRecordedConsumptions,
  type BranchConsumptionSourceKind,
  type BranchRecordedConsumption,
} from "@lib/inventory/branch-consumption-model";
import {
  filterBranchStockIssues,
  type BranchStockIssue,
  type BranchStockIssueStatusFilter,
} from "@lib/inventory/stock-issue-model";
import { messages } from "@lib/messages";

const issuesCopy = messages.inventory.issues;

type ConsumptionView = "recorded" | "manual";

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

function sourceBadgeVariant(kind: BranchConsumptionSourceKind) {
  if (kind === "pos") return "info" as const;
  if (kind === "hrm") return "warning" as const;
  if (kind === "manual") return "secondary" as const;
  return "outline" as const;
}

export function BranchConsumptionListClient({
  branchId,
  branchName,
  canManage,
  showRecorded,
  manualIssues,
  manualIssuesLoadFailed,
  recorded,
  recordedLoadFailed,
}: {
  branchId: number;
  branchName: string;
  canManage: boolean;
  showRecorded: boolean;
  manualIssues: BranchStockIssue[];
  manualIssuesLoadFailed: boolean;
  recorded: BranchRecordedConsumption[];
  recordedLoadFailed: boolean;
}) {
  const router = useRouter();
  const basePath = `/br/${branchId}/stock/consumption`;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("view");
  const view: ConsumptionView =
    showRecorded && requestedView !== "manual" ? "recorded" : "manual";
  const setView = useCallback(
    (next: ConsumptionView) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "recorded") params.delete("view");
      else params.set("view", next);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<BranchStockIssueStatusFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [selectedMovement, setSelectedMovement] =
    useState<BranchRecordedConsumption | null>(null);
  const [isPending, startTransition] = useTransition();
  const filteredManual = useMemo(
    () => filterBranchStockIssues(manualIssues, { query, status }),
    [manualIssues, query, status],
  );
  const filteredRecorded = useMemo(
    () => filterBranchRecordedConsumptions(recorded, query),
    [query, recorded],
  );
  const filtersActive =
    query.trim() !== "" || (view === "manual" && status !== "all");
  const searchLabel =
    view === "recorded"
      ? INVENTORY_VI.recordedSearchPlaceholder
      : INVENTORY_VI.issueSearchPlaceholder;

  function resetFilters() {
    setQuery("");
    setStatus("all");
  }

  function createManualSlip() {
    startTransition(async () => {
      const result = await createStockIssueDraft({
        branchId,
        issueType: "consumption",
        notes: notes.trim() || undefined,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? issuesCopy.listLoadFailed);
        return;
      }
      const created = result.data as { id: number };
      toast.success(INVENTORY_VI.issueCreated);
      setCreateOpen(false);
      setNotes("");
      router.push(`${basePath}/${created.id}`);
      router.refresh();
    });
  }

  return (
    <BranchOperatorPage
      title={issuesCopy.surface.consumption.eyebrow}
      description={branchName}
      hideHeaderOnMobile
    >
      <Tabs
        value={view}
        onValueChange={(value) => {
          setView(value as ConsumptionView);
          setQuery("");
          setStatus("all");
        }}
      >
        <TabsList
          size="touch"
          className={showRecorded ? "grid w-full grid-cols-2" : "grid w-full"}
        >
          {showRecorded ? (
            <TabsTrigger value="recorded">
              {INVENTORY_VI.recordedConsumptionTitle}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="manual">
            {INVENTORY_VI.manualConsumptionSlipsTitle}
          </TabsTrigger>
        </TabsList>
        <TabsContent value={view}>
      <BranchOperatorPanel
        title={
          view === "recorded"
            ? INVENTORY_VI.recordedConsumptionTitle
            : INVENTORY_VI.manualConsumptionSlipsTitle
        }
        description={
          view === "recorded"
            ? INVENTORY_VI.recordedEmptyDescription
            : INVENTORY_VI.manualConsumptionCreateDescription
        }
        icon={view === "recorded" ? IconHistory : IconClipboard}
        badge={{
          children:
            view === "recorded"
              ? `${filteredRecorded.length}/${recorded.length}`
              : `${filteredManual.length}/${manualIssues.length}`,
        }}
        contentClassName="gap-3"
      >
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <InputGroup className="min-h-12 min-w-0 flex-1">
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput
              aria-label={searchLabel}
              name="branchConsumptionSearch"
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchLabel}
              inputMode="search"
            />
          </InputGroup>
          {view === "manual" ? (
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus(value as BranchStockIssueStatusFilter)
              }
            >
              <SelectTrigger
                size="touch"
                className="w-full sm:w-auto sm:min-w-48"
                aria-label={FORM_VI.status}
              >
                <SelectValue placeholder={FORM_VI.status} />
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
          ) : null}
        </div>

        {filtersActive ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              onClick={resetFilters}
              aria-label={ACTIONS_VI.reset}
              title={ACTIONS_VI.reset}
            >
              <IconReset className="size-4" />
            </Button>
          </div>
        ) : null}

        {view === "recorded" ? (
          recordedLoadFailed ? (
            <AppEmptyState
              compact
              mode="error"
              icon={<IconHistory />}
              title={issuesCopy.listLoadFailed}
            >
              <Button size="touch" onClick={() => router.refresh()}>
                {ACTIONS_VI.retry}
              </Button>
            </AppEmptyState>
          ) : filteredRecorded.length === 0 ? (
            <AppEmptyState
              compact
              mode={filtersActive ? "no-results" : "no-data"}
              icon={<IconHistory />}
              title={INVENTORY_VI.recordedEmptyTitle}
              description={INVENTORY_VI.recordedEmptyDescription}
            />
          ) : (
            <ItemGroup className="grid gap-2 lg:grid-cols-2">
              {filteredRecorded.map((movement) => (
                <Item
                  key={movement.id}
                  variant="outline"
                  className="min-h-20 touch-manipulation"
                  render={
                    <button
                      type="button"
                      onClick={() => setSelectedMovement(movement)}
                    />
                  }
                >
                  <ItemContent className="min-w-0 gap-1 text-left">
                    <ItemTitle size="heading">
                      {movement.ingredientName}
                    </ItemTitle>
                    <ItemDescription className="line-clamp-none flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono tabular-nums">
                        {movement.quantity} {movement.unit}
                      </span>
                      <span>{formatVNDateTime(movement.recordedAt)}</span>
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Badge variant={sourceBadgeVariant(movement.sourceKind)}>
                      {movement.sourceLabel}
                    </Badge>
                    <IconChevronRight className="size-4 text-muted-foreground" />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )
        ) : manualIssuesLoadFailed ? (
          <AppEmptyState
            compact
            mode="error"
            icon={<IconClipboard />}
            title={issuesCopy.listLoadFailed}
          >
            <Button size="touch" onClick={() => router.refresh()}>
              {ACTIONS_VI.retry}
            </Button>
          </AppEmptyState>
        ) : filteredManual.length === 0 ? (
          <AppEmptyState
            compact
            mode={filtersActive ? "no-results" : "no-data"}
            icon={<IconClipboard />}
            title={
              filtersActive
                ? INVENTORY_VI.issueEmptyFiltered
                : INVENTORY_VI.manualConsumptionEmptyTitle
            }
            description={INVENTORY_VI.manualConsumptionEmptyDescription}
          />
        ) : (
          <ItemGroup className="grid gap-2 lg:grid-cols-2">
            {filteredManual.map((issue) => (
              <Item
                key={issue.id}
                variant="outline"
                className="min-h-20 touch-manipulation"
                render={<Link href={`${basePath}/${issue.id}`} />}
              >
                <ItemContent className="min-w-0 gap-1">
                  <ItemTitle size="heading" className="font-mono">
                    {issue.code}
                  </ItemTitle>
                  <ItemDescription className="line-clamp-none">
                    {formatVNDateTime(issue.issuedAt)}
                  </ItemDescription>
                  {issue.notes ? (
                    <ItemDescription className="line-clamp-2 break-words">
                      {issue.notes}
                    </ItemDescription>
                  ) : null}
                </ItemContent>
                <ItemActions>
                  <StatusBadge
                    domain="inventory"
                    value={issue.status}
                    size="sm"
                  />
                  <IconChevronRight className="size-4 text-muted-foreground" />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </BranchOperatorPanel>
        </TabsContent>
      </Tabs>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-dvh-95 overflow-y-auto overscroll-contain bg-background p-0"
        >
          <SheetHeader>
            <SheetTitle>
              {INVENTORY_VI.manualConsumptionCreateAction}
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              {INVENTORY_VI.manualConsumptionCreateDescription}
            </p>
          </SheetHeader>
          <div className="px-4 pb-4">
            <FormField
              controlId="branch-consumption-notes"
              label={FORM_VI.notes}
            >
              <Textarea
                id="branch-consumption-notes"
                name="notes"
                rows={4}
                maxLength={500}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={INVENTORY_VI.issueNotesPlaceholder}
              />
            </FormField>
          </div>
          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={isPending}
              onClick={() => setCreateOpen(false)}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="button"
              size="touch-lg"
              disabled={isPending}
              onClick={createManualSlip}
            >
              {isPending ? <Spinner className="size-5" /> : null}
              {INVENTORY_VI.manualConsumptionCreateAction}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet
        open={selectedMovement != null}
        onOpenChange={(open) => {
          if (!open) setSelectedMovement(null);
        }}
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-dvh-95 overflow-y-auto overscroll-contain bg-background p-0"
        >
          {selectedMovement ? (
            <>
              <SheetHeader>
                <SheetTitle>{selectedMovement.ingredientName}</SheetTitle>
                <p className="text-sm text-muted-foreground">
                  {selectedMovement.sourceLabel}
                </p>
              </SheetHeader>
              <div className="px-4 pb-4">
                <BranchOperatorDetailList
                  columns={1}
                  rows={[
                    {
                      label: FORM_VI.quantity,
                      value: `${selectedMovement.quantity} ${selectedMovement.unit}`,
                    },
                    {
                      label: INVENTORY_VI.recordedAtLabel,
                      value: formatVNDateTime(selectedMovement.recordedAt),
                    },
                    {
                      label: INVENTORY_VI.deductLocationLabel,
                      value: selectedMovement.locationName,
                    },
                    {
                      label: INVENTORY_VI.sourceLabel,
                      value: selectedMovement.sourceLabel,
                    },
                  ]}
                />
              </div>
              <SheetFooter>
                {selectedMovement.issueId != null ? (
                  <Button
                    size="touch-lg"
                    render={
                      <Link href={`${basePath}/${selectedMovement.issueId}`} />
                    }
                  >
                    {ACTIONS_VI.viewDetails}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  onClick={() => setSelectedMovement(null)}
                >
                  {ACTIONS_VI.close}
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {canManage ? (
        <AppDetailFooter
          sticky
          trailing={
            <Button
              type="button"
              size="touch-lg"
              className="w-full"
              onClick={() => setCreateOpen(true)}
            >
              <IconPlus className="size-4" />
              {INVENTORY_VI.manualConsumptionCreateAction}
            </Button>
          }
        />
      ) : null}
    </BranchOperatorPage>
  );
}
