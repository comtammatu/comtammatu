"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { ReasonConfirmDialog } from "@comtammatu/ui/components/reason-confirm-dialog";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { Check as IconCheck, X as IconX } from "lucide-react";
import { Item, ItemGroup } from "@comtammatu/ui/components/item";
import { WasteTierBadge } from "@/(protected)/inventory/_components/waste-tier-badge";
import { approveWaste } from "@/(protected)/inventory/waste-actions";
import {
  formatPercent,
  formatQuantity,
  formatVND,
} from "@comtammatu/shared/format";
import { getWasteReasonLabelVi } from "@comtammatu/shared/labels";
import { formatVNDateTime } from "@comtammatu/shared/time";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import { messages } from "@lib/messages";
import type { PendingWasteRow } from "@lib/inventory/waste-approval-model";

const toastSelfApproveForbidden =
  "Không thể tự duyệt phiếu của mình (4-eye principle)";
const toastApproveFailed = "Không duyệt được";
const toastApproveSuccess = (issueNumber: string) =>
  `Đã duyệt phiếu ${issueNumber}`;
const toastRejectSuccess = (issueNumber: string) =>
  `Đã từ chối phiếu ${issueNumber}`;

interface Props {
  initial: PendingWasteRow[];
  branchFilter: number | null;
  loadFailed: boolean;
}

export function WasteApprovalsClient({
  initial,
  branchFilter,
  loadFailed,
}: Props) {
  const [rows, setRows] = useState(initial);
  const copy = messages.inventory.waste.approvals;

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  return (
    <AppPage width="xwide">
      <AppPageHeader
        title={copy.title}
        description={`${copy.principle}${branchFilter !== null ? copy.branchSuffix(branchFilter) : ""}`}
        badge={{ children: copy.count(rows.length) }}
      />
      {loadFailed ? (
        <AppEmptyState
          compact
          mode="error"
          title={copy.loadFailed}
          description={copy.loadFailedDescription}
        />
      ) : rows.length === 0 ? (
        <AppEmptyState compact title={copy.empty} symbol="riceGrain" />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <WasteApprovalCard
              key={row.issueId}
              row={row}
              onResolved={(id) =>
                setRows((prev) =>
                  prev.filter((current) => current.issueId !== id),
                )
              }
            />
          ))}
        </div>
      )}
    </AppPage>
  );
}

function WasteApprovalCard({
  row,
  onResolved,
}: {
  row: PendingWasteRow;
  onResolved: (issueId: number) => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [pending, setPending] = useState<"approved" | "rejected" | null>(null);
  const [, startTransition] = useTransition();
  const copy = messages.inventory.waste.approvals;

  function handleDecision(decision: "approved" | "rejected") {
    if (row.isSelfCreated) {
      toast.error(toastSelfApproveForbidden);
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
        toast.error(res.error ?? toastApproveFailed);
        return;
      }
      toast.success(
        decision === "approved"
          ? toastApproveSuccess(row.issueNumber)
          : toastRejectSuccess(row.issueNumber),
      );
      setRejectOpen(false);
      setNote("");
      onResolved(row.issueId);
      router.refresh();
    });
  }

  return (
    <AppSection
      size="sm"
      tone={row.isSelfCreated ? "warning" : "default"}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {row.issueNumber}
          <Badge variant="outline" className="text-xs">
            {row.branchName}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {row.shiftKey}
          </Badge>
          {row.sourceType !== "manual" ? (
            <Badge variant="secondary" className="text-xs">
              {row.sourceType}
            </Badge>
          ) : null}
        </span>
      }
      description={
        <>
          {row.createdByName}
          {row.isSelfCreated ? (
            <Badge className="ml-2 border border-warning/20 bg-warning/15 text-xs text-warning">
              {copy.selfCreatedBadge}
            </Badge>
          ) : null}
          {" • "}
          {formatVNDateTime(row.issuedAt)}
        </>
      }
      action={
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
      }
    >
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
                      ? ` × ${formatVND(it.monetary.unitCost)}`
                      : ""}
                  </span>
                </div>
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
          size="default"
          onClick={() => setRejectOpen(true)}
          disabled={pending !== null || row.isSelfCreated}
          className="text-destructive"
        >
          {pending === "rejected" ? <Spinner /> : <IconX className="size-4" />}
          {copy.reject}
        </Button>
        <Button
          size="default"
          onClick={() => handleDecision("approved")}
          disabled={pending !== null || row.isSelfCreated}
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
    </AppSection>
  );
}
