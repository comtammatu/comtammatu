"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { Check as IconCheck, X as IconX } from "lucide-react";
import { Item, ItemGroup } from "@comtammatu/ui/components/item";
import { WasteTierBadge } from "@/(protected)/inventory/_components/waste-tier-badge";
import { approveWaste } from "@/(protected)/inventory/waste-actions";
import { formatVND } from "@comtammatu/shared/format";
import { getWasteReasonLabelVi } from "@comtammatu/shared/labels";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";

type PendingWasteItem = {
  itemId: number;
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  unit: string;
  unitCost: number | null;
  totalCost: number;
  reasonCode: string;
  photoUrls: string[];
  wasteTier: number | null;
  qtyRatio: number | null;
  rolling15MinSum: number | null;
};

export type PendingWasteRow = {
  issueId: number;
  issueNumber: string;
  branchId: number;
  branchName: string;
  issuedAt: string;
  shiftKey: string;
  sourceType: string;
  createdBy: string;
  createdByName: string;
  isSelfCreated: boolean;
  totalValue: number;
  notes: string | null;
  items: PendingWasteItem[];
};

interface Props {
  initial: PendingWasteRow[];
  branchFilter: number | null;
  embedded?: boolean;
}

export function WasteApprovalsClient({
  initial,
  branchFilter,
  embedded = false,
}: Props) {
  const [rows, setRows] = useState(initial);
  const copy = messages.inventory.waste.approvals;

  const content = (
    <>
      <AppPageHeader
        eyebrow="Kho hàng"
        title={copy.title}
        description={`${copy.principle}${branchFilter !== null ? copy.branchSuffix(branchFilter) : ""}`}
        badge={{ children: copy.count(rows.length) }}
      />

      {rows.length === 0 ? (
        <AppEmptyState compact title={copy.empty} />
      ) : (
        <ItemGroup className="flex flex-col gap-3 p-0 rounded-none border-0">
          {rows.map((row) => (
            <WasteApprovalCard
              key={row.issueId}
              row={row}
              onResolved={(id) =>
                setRows((prev) => prev.filter((r) => r.issueId !== id))
              }
            />
          ))}
        </ItemGroup>
      )}
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return <AppPage width="default">{content}</AppPage>;
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
  const [pending, setPending] = useState<"approved" | "rejected" | null>(null);
  const [, startTransition] = useTransition();
  const copy = messages.inventory.waste.approvals;

  function handleDecision(decision: "approved" | "rejected") {
    if (row.isSelfCreated) {
      toast.error("Không thể tự duyệt phiếu của mình (4-eye principle)");
      return;
    }
    setPending(decision);
    startTransition(async () => {
      const res = await approveWaste({
        issueId: row.issueId,
        decision,
        note: note || undefined,
      });
      setPending(null);
      if (!res.success) {
        toast.error(res.error ?? "Không duyệt được");
        return;
      }
      toast.success(
        decision === "approved"
          ? `Đã duyệt phiếu ${row.issueNumber}`
          : `Đã từ chối phiếu ${row.issueNumber}`,
      );
      onResolved(row.issueId);
      router.refresh();
    });
  }

  return (
    <Item
      variant="outline"
      className={cn(
        "rounded-lg border bg-card p-0 flex flex-col items-stretch",
        row.isSelfCreated && "border-warning/40 bg-warning/10",
      )}
    >
        <div className="p-4 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-heading text-base flex items-center gap-2 font-semibold">
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
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {row.createdByName}
                {row.isSelfCreated ? (
                  <Badge className="ml-2 bg-warning/15 text-warning-foreground border-warning/40 border text-xs">
                    {copy.selfCreatedBadge}
                  </Badge>
                ) : null}
                {" • "}
                {formatVNDateTime(row.issuedAt)}
              </p>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold tabular-nums">
                {formatVND(row.totalValue)}
              </div>
              <div className="text-xs text-muted-foreground">
                {copy.lineCount(row.items.length)}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 p-4 pt-0">
          <ItemGroup className="flex flex-col gap-2 p-0 rounded-none border-0">
            {row.items.map((it) => (
              <Item
                key={it.itemId}
                variant="muted"
                className="rounded-md border bg-muted/20 p-3 text-sm flex flex-col items-stretch"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {it.ingredientName}{" "}
                      <span className="text-muted-foreground">
                        — {it.quantity} {it.unit}
                        {it.unitCost !== null
                          ? ` × ${formatVND(it.unitCost)}`
                          : ""}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {copy.reason(getWasteReasonLabelVi(it.reasonCode))}
                      {typeof it.qtyRatio === "number" && it.qtyRatio > 0
                        ? copy.qtyRatio(Math.round(it.qtyRatio * 100))
                        : ""}
                      {typeof it.rolling15MinSum === "number" &&
                      it.rolling15MinSum > 0
                        ? copy.rolling15m(formatVND(it.rolling15MinSum))
                        : ""}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="font-medium tabular-nums">
                      {formatVND(it.totalCost)}
                    </div>
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

          <div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={pending !== null || row.isSelfCreated}
              rows={2}
              placeholder={copy.reviewNotePlaceholder}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => handleDecision("rejected")}
              disabled={pending !== null || row.isSelfCreated}
              className="text-destructive"
            >
              {pending === "rejected" ? (
                <Spinner />
              ) : (
                <IconX className="size-4" />
              )}
              {copy.reject}
            </Button>
            <Button
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
        </div>
      </Item>
  );
}
