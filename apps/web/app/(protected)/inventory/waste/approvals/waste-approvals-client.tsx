"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { ReasonConfirmDialog } from "@/components/reason-confirm-dialog";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Check as IconCheck,
  Search as IconSearch,
  X as IconX,
} from "lucide-react";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { WasteTierBadge } from "@/(protected)/inventory/_components/waste-tier-badge";
import { getIssueBaseQuantity } from "@/(protected)/inventory/_lib/issue-units";
import { approveWaste } from "@/(protected)/inventory/waste-actions";
import {
  formatPercent,
  formatQuantity,
  formatVND,
} from "@comtammatu/shared/format";
import { getWasteReasonLabelVi } from "@comtammatu/shared/labels";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import {
  AppEmptyState,
  AppListFrame,
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppDialog } from "@/components/form";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { useFormControlSize } from "@/components/form/control-size";
import { messages } from "@lib/messages";
import type { PendingWasteRow } from "@lib/inventory/waste-approval-model";
import { useDocumentOverlayUrl } from "@lib/navigation/use-document-overlay-url";

const WASTE_APPROVAL_OVERLAY_KEYS = ["wasteIssueId"] as const;

interface Props {
  initial: PendingWasteRow[];
  branchFilter: number | null;
  loadFailed: boolean;
}

export function WasteApprovalsClient({ initial, loadFailed }: Props) {
  const [rows, setRows] = useState(initial);
  const [searchTerm, setSearchTerm] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const overlay = useDocumentOverlayUrl(WASTE_APPROVAL_OVERLAY_KEYS);
  const activeIssueIdParam = overlay.get("wasteIssueId");
  const activeIssueId =
    activeIssueIdParam && /^\d+$/.test(activeIssueIdParam)
      ? Number(activeIssueIdParam)
      : null;
  const controlSize = useFormControlSize("responsive");
  const copy = messages.inventory.waste.approvals;

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesSearch =
        searchTerm.trim() === "" ||
        row.issueNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.createdByName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.branchName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.items.some((item) =>
          item.ingredientName.toLowerCase().includes(searchTerm.toLowerCase()),
        );

      const matchesTier =
        tierFilter === "all" ||
        (tierFilter === "tier1" &&
          row.items.some((i) => (i.wasteTier ?? 1) === 1)) ||
        (tierFilter === "tier2" && row.items.some((i) => i.wasteTier === 2));

      return matchesSearch && matchesTier;
    });
  }, [rows, searchTerm, tierFilter]);

  const activeRow = rows.find((row) => row.issueId === activeIssueId) ?? null;

  function resolveRow(issueId: number) {
    setRows((current) => current.filter((row) => row.issueId !== issueId));
    overlay.clearOverlay();
  }

  function getRowActions(row: PendingWasteRow): RowActionItem[] {
    return [
      {
        key: "review",
        label: copy.reviewAction,
        onSelect: () =>
          overlay.patchOverlay({ wasteIssueId: row.issueId }, "push"),
      },
    ];
  }

  const columns: DataTableColumn<PendingWasteRow>[] = [
    {
      key: "issue",
      header: copy.issueHeader,
      className: "min-w-52",
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{row.issueNumber}</span>
          <span className="text-xs text-muted-foreground">
            {row.createdByName} · {formatVNDateTime(row.issuedAt)}
          </span>
        </div>
      ),
    },
    {
      key: "scope",
      header: copy.scopeHeader,
      className: "min-w-40",
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span>{row.branchName}</span>
          <span className="text-xs text-muted-foreground">{row.shiftKey}</span>
        </div>
      ),
    },
    {
      key: "items",
      header: copy.itemsHeader,
      className: "min-w-64",
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span className="line-clamp-1">
            {row.items
              .slice(0, 2)
              .map((item) => item.ingredientName)
              .join(", ")}
          </span>
          <span className="text-xs text-muted-foreground">
            {copy.lineCount(row.items.length)}
          </span>
        </div>
      ),
    },
    {
      key: "value",
      header: copy.valueHeader,
      className: "w-36 text-right",
      render: (row) => (
        <span className="block text-right font-mono tabular-nums">
          {row.monetary ? formatVND(row.monetary.totalValue) : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{copy.actionsHeader}</span>,
      className: "w-12 text-right",
      render: (row) => (
        <RowActionsMenu items={getRowActions(row)} triggerSize="icon-sm" />
      ),
    },
  ];

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={copy.title}
        badge={{ children: copy.count(rows.length) }}
      />
      {loadFailed ? (
        <AppListFrame>
          <AppEmptyState
            compact
            mode="error"
            title={copy.loadFailed}
            description={copy.loadFailedDescription}
          />
        </AppListFrame>
      ) : (
        <AppListFrame
          toolbar={
            <AppToolbar
              variant="inline"
              search={
                <InputGroup size={controlSize} className="min-w-0 flex-1">
                  <InputGroupAddon>
                    <IconSearch aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    type="search"
                    aria-label={copy.searchLabel}
                    placeholder={INVENTORY_VI.wasteApprovalSearchPlaceholder}
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    inputMode="search"
                  />
                </InputGroup>
              }
              filters={
                <Select value={tierFilter} onValueChange={setTierFilter}>
                  <SelectTrigger size={controlSize} className="min-w-44">
                    <SelectValue
                      placeholder={
                        INVENTORY_VI.wasteApprovalTierFilterPlaceholder
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {INVENTORY_VI.wasteApprovalTierAll}
                    </SelectItem>
                    <SelectItem value="tier1">
                      {INVENTORY_VI.wasteApprovalTier1}
                    </SelectItem>
                    <SelectItem value="tier2">
                      {INVENTORY_VI.wasteApprovalTier2}
                    </SelectItem>
                  </SelectContent>
                </Select>
              }
            />
          }
        >
          <DataTable
            columns={columns}
            data={filteredRows}
            getRowKey={(row) => row.issueId}
            emptyMode={
              searchTerm.trim() || tierFilter !== "all"
                ? "no-results"
                : "no-data"
            }
            emptyTitle={
              rows.length === 0
                ? copy.empty
                : INVENTORY_VI.wasteApprovalEmptyTitle
            }
            emptyDescription={
              rows.length === 0
                ? undefined
                : INVENTORY_VI.wasteApprovalEmptyDescription
            }
            onRowClick={(row) =>
              overlay.patchOverlay({ wasteIssueId: row.issueId }, "push")
            }
            getRowAriaLabel={(row) => copy.reviewAria(row.issueNumber)}
            renderRowContextMenu={(row) => (
              <RowActionsContextMenuItems items={getRowActions(row)} />
            )}
            mobileCardRender={(row) => (
              <Item variant="outline" className="items-start">
                <ItemContent className="min-w-0">
                  <ItemTitle>{row.issueNumber}</ItemTitle>
                  <ItemDescription>
                    {row.branchName} · {copy.lineCount(row.items.length)}
                  </ItemDescription>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{row.shiftKey}</Badge>
                    {row.items.some((item) => item.wasteTier === 2) ? (
                      <WasteTierBadge tier={2} compact />
                    ) : null}
                  </div>
                </ItemContent>
                <RowActionsMenu
                  items={getRowActions(row)}
                  triggerSize={
                    controlSize === "touch" ? "icon-touch" : "icon-lg"
                  }
                  itemSize={controlSize === "touch" ? "touch" : "default"}
                />
              </Item>
            )}
          />
        </AppListFrame>
      )}

      {activeRow ? (
        <AppDialog
          open
          onOpenChange={(open) => {
            if (!open) overlay.clearOverlay();
          }}
          title={activeRow.issueNumber}
          description={`${activeRow.branchName} · ${formatVNDateTime(activeRow.issuedAt)}`}
          contentClassName="sm:max-w-3xl"
          bodyClassName="max-h-dvh-95 overflow-y-auto"
        >
          <WasteApprovalReview row={activeRow} onResolved={resolveRow} />
        </AppDialog>
      ) : null}
    </AppPage>
  );
}

function WasteApprovalReview({
  row,
  onResolved,
}: {
  row: PendingWasteRow;
  onResolved: (issueId: number) => void;
}) {
  const router = useRouter();
  const controlSize = useFormControlSize("responsive");
  const [note, setNote] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [pending, setPending] = useState<"approved" | "rejected" | null>(null);
  const [, startTransition] = useTransition();
  const copy = messages.inventory.waste.approvals;

  function handleDecision(decision: "approved" | "rejected") {
    if (row.isSelfCreated && !row.canBypassSelfApproval) {
      toast.error(copy.selfApproveForbidden);
      return;
    }
    setPending(decision);
    startTransition(async () => {
      const res = await approveWaste({
        issueId: row.issueId,
        decision,
        note: decision === "rejected" ? note.trim() : undefined,
      });
      setPending(null);
      if (!res.success) {
        toast.error(res.error ?? copy.approveFailed);
        return;
      }
      toast.success(
        decision === "approved"
          ? copy.approveSuccess(row.issueNumber)
          : copy.rejectSuccess(row.issueNumber),
      );
      setRejectOpen(false);
      setNote("");
      onResolved(row.issueId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{row.shiftKey}</Badge>
          <span className="text-sm text-muted-foreground">
            {row.createdByName}
          </span>
          {row.isSelfCreated ? (
            <Badge className="border border-warning/20 bg-warning/15 text-warning">
              {row.canBypassSelfApproval
                ? copy.selfCreatedBypassBadge
                : copy.selfCreatedBadge}
            </Badge>
          ) : null}
        </div>
        <div className="text-right">
          {row.monetary ? (
            <div className="text-lg font-semibold tabular-nums">
              {formatVND(row.monetary.totalValue)}
            </div>
          ) : null}
          <div className="text-xs text-muted-foreground">
            {copy.lineCount(row.items.length)}
          </div>
        </div>
      </div>
      <ItemGroup className="flex flex-col gap-2 rounded-none border-0 p-0">
        {row.items.map((it) => (
          <Item
            key={it.itemId}
            variant="muted"
            className="flex flex-col items-stretch bg-muted/30"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {it.ingredientName}{" "}
                  <span className="text-muted-foreground">
                    — {formatQuantity(it.quantity)} {it.unit}
                    {it.monetary?.unitCost != null
                      ? ` × ${formatVND(it.monetary.unitCost)}${
                          it.baseUnit ? `/${it.baseUnit}` : ""
                        }`
                      : ""}
                  </span>
                </div>
                {it.baseUnit &&
                it.unit &&
                it.baseUnit !== it.unit &&
                it.toBaseFactor !== 1 ? (
                  <div className="text-xs text-muted-foreground">
                    {messages.inventory.issues.entryBaseQtyHint(
                      formatQuantity(it.quantity),
                      it.unit,
                      formatQuantity(
                        getIssueBaseQuantity(it.quantity, {
                          toBaseFactor: it.toBaseFactor,
                        }),
                      ),
                      it.baseUnit,
                    )}
                  </div>
                ) : null}
                <div className="text-xs text-muted-foreground">
                  {copy.reason(getWasteReasonLabelVi(it.reasonCode))}
                  {typeof it.monetary?.qtyRatio === "number" &&
                  it.monetary.qtyRatio > 0
                    ? copy.qtyRatio(
                        formatPercent(it.monetary.qtyRatio * 100, 0),
                      )
                    : ""}
                  {typeof it.monetary?.rolling15MinSum === "number" &&
                  it.monetary.rolling15MinSum > 0
                    ? copy.rolling15m(formatVND(it.monetary.rolling15MinSum))
                    : ""}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {it.monetary ? (
                  <div className="font-medium tabular-nums">
                    {formatVND(it.monetary.totalCost)}
                  </div>
                ) : null}
                <WasteTierBadge tier={it.wasteTier} compact />
              </div>
            </div>
            {it.photoUrls.length > 0 ? (
              <div className="mt-2 flex gap-2">
                {it.photoUrls.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary underline"
                  >
                    {copy.viewPhoto}
                  </a>
                ))}
              </div>
            ) : null}
          </Item>
        ))}
      </ItemGroup>

      {row.notes ? (
        <p className="line-clamp-2 break-words text-xs italic text-muted-foreground">
          {copy.notes(row.notes)}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size={controlSize}
          onClick={() => setRejectOpen(true)}
          disabled={
            pending !== null ||
            (row.isSelfCreated && !row.canBypassSelfApproval)
          }
          className="flex-1 text-destructive sm:flex-initial"
        >
          {pending === "rejected" ? <Spinner /> : <IconX className="size-4" />}
          {copy.reject}
        </Button>
        <Button
          size={controlSize}
          onClick={() => handleDecision("approved")}
          disabled={
            pending !== null ||
            (row.isSelfCreated && !row.canBypassSelfApproval)
          }
          className="flex-1 font-semibold sm:flex-initial"
        >
          {pending === "approved" ? (
            <Spinner />
          ) : (
            <IconCheck className="size-4" />
          )}
          {copy.approve}
        </Button>
      </div>
      <ReasonConfirmDialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open);
          if (!open && pending === null) setNote("");
        }}
        title={copy.rejectTitle}
        description={row.issueNumber}
        reasonId={`waste-reject-reason-${row.issueId}`}
        reason={note}
        onReasonChange={setNote}
        reasonLabel={copy.rejectReason}
        reasonPlaceholder={copy.reviewNotePlaceholder}
        reasonMinLength={5}
        reasonTextareaProps={{ maxLength: 500, autoFocus: true }}
        cancelLabel={copy.rejectCancel}
        cancelDisabled={pending !== null}
        confirmLabel={copy.reject}
        confirmVariant="destructive"
        isPending={pending === "rejected"}
        onConfirm={() => handleDecision("rejected")}
      />
    </div>
  );
}
