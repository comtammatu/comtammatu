"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: manager count-slip review surface keeps operational copy inline */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check as IconCheck,
  ClipboardCheck as IconClipboardCheck,
  RotateCcw as IconRecount,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Item, ItemGroup } from "@comtammatu/ui/components/item";
import { cn } from "@comtammatu/ui";
import { formatVNDate, formatVNDateTime } from "@comtammatu/shared/time";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import { formatQty } from "../_lib/format";
import { approveCountSlip, requestCountRecount } from "./actions";
import type { CountSlipLineView } from "./line-view-model";

export type CountSlipStatus = "submitted" | "needs_changes" | "approved";

export type CountSlipLine = CountSlipLineView;

export type CountSlipRow = {
  id: number;
  branchName: string;
  locationName: string;
  employeeName: string;
  countDate: string;
  status: CountSlipStatus;
  note: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  lines: CountSlipLine[];
};

function formatVariance(value: number | null): string {
  if (value === null) return "—";
  const formatted = formatQty(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

function varianceClassName(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value < 0) return "text-destructive";
  if (value > 0) return "text-warning";
  return "text-muted-foreground";
}

function hasVariance(
  line: CountSlipLine,
): line is CountSlipLine & { variance: number } {
  return line.variance !== null;
}

export function CountSlipsClient({
  initial,
  branchScoped = false,
  embedded = false,
}: {
  initial: CountSlipRow[];
  branchScoped?: boolean;
  embedded?: boolean;
}) {
  const [rows, setRows] = useState(initial);

  const { pending, history } = useMemo(() => {
    const pendingRows: CountSlipRow[] = [];
    const historyRows: CountSlipRow[] = [];
    for (const row of rows) {
      if (row.status === "submitted") pendingRows.push(row);
      else historyRows.push(row);
    }
    return { pending: pendingRows, history: historyRows };
  }, [rows]);

  function applyStatus(slipId: number, status: CountSlipStatus) {
    setRows((prev) =>
      prev.map((row) => (row.id === slipId ? { ...row, status } : row)),
    );
  }

  const content = (
    <>
      {!embedded ? (
        <AppPageHeader
          title="Duyệt phiếu đếm tồn"
          description="Đối chiếu số đếm với tồn hệ thống. Duyệt để ghi điều chỉnh kho, hoặc yêu cầu nhân viên đếm lại."
          badge={{
            children: `${pending.length} chờ duyệt`,
            variant: pending.length > 0 ? "warning" : "secondary",
          }}
        />
      ) : null}

      {pending.length === 0 ? (
        <AppEmptyState
          compact
          title="Không có phiếu đếm chờ duyệt"
          description="Khi nhân viên gửi phiếu đếm tồn, phiếu sẽ xuất hiện tại đây."
          icon={<IconClipboardCheck />}
        />
      ) : (
        <ItemGroup className="flex flex-col gap-3 p-0 rounded-none border-0">
          {pending.map((row) => (
            <CountSlipCard
              key={row.id}
              row={row}
              branchScoped={branchScoped}
              embedded={embedded}
              onApproved={() => applyStatus(row.id, "approved")}
              onRecount={() => applyStatus(row.id, "needs_changes")}
            />
          ))}
        </ItemGroup>
      )}

      {history.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-base font-semibold tracking-tight">
            Đã xử lý gần đây
          </h2>
          <ItemGroup className="flex flex-col gap-3 p-0 rounded-none border-0">
            {history.map((row) => (
              <CountSlipCard
                key={row.id}
                row={row}
                branchScoped={branchScoped}
                embedded={embedded}
                readOnly
              />
            ))}
          </ItemGroup>
        </section>
      ) : null}
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return (
    <AppPage width="wide" density="compact">
      {content}
    </AppPage>
  );
}

function CountSlipCard({
  row,
  branchScoped = false,
  readOnly = false,
  embedded = false,
  onApproved,
  onRecount,
}: {
  row: CountSlipRow;
  branchScoped?: boolean;
  readOnly?: boolean;
  embedded?: boolean;
  onApproved?: () => void;
  onRecount?: () => void;
}) {
  const router = useRouter();
  const [recounting, setRecounting] = useState(false);
  const [note, setNote] = useState("");
  const [pendingAction, setPendingAction] = useState<
    "approve" | "recount" | null
  >(null);
  const [, startTransition] = useTransition();

  const knownVarianceLines = row.lines.filter(hasVariance);
  const totalVariance = knownVarianceLines.reduce(
    (sum, line) => sum + (line.variance ?? 0),
    0,
  );
  const varianceUnits = new Set(
    knownVarianceLines.map((line) => line.varianceUnit).filter(Boolean),
  );
  const totalVarianceUnit =
    varianceUnits.size === 1 ? (varianceUnits.values().next().value ?? "") : "";
  const showTotalVariance =
    knownVarianceLines.length === row.lines.length && totalVarianceUnit !== "";
  const changedLineCount = knownVarianceLines.filter(
    (line) => line.variance !== 0,
  ).length;
  const hasShrinkage = row.lines.some(
    (line) => line.variance !== null && line.variance < 0,
  );

  async function handleApprove() {
    const ok = await confirm({
      title: "Duyệt phiếu đếm tồn?",
      description:
        "Hệ thống sẽ ghi điều chỉnh kho theo số đếm và không thể hoàn tác từ màn này.",
      details: [
        { label: "Nhân viên", value: row.employeeName },
        { label: "Kho", value: row.locationName },
        { label: "Số dòng", value: `${row.lines.length} nguyên liệu` },
      ],
      confirmText: "Duyệt",
      variant: "destructive",
    });
    if (!ok) return;

    setPendingAction("approve");
    startTransition(async () => {
      const res = await approveCountSlip({ slipId: row.id });
      setPendingAction(null);
      if (!res.success) {
        toast.error(res.error ?? "Không duyệt được phiếu đếm.");
        return;
      }
      toast.success(
        res.data && res.data.adjustedLines > 0
          ? `Đã duyệt và điều chỉnh ${res.data.adjustedLines} dòng kho.`
          : "Đã duyệt phiếu đếm tồn.",
      );
      onApproved?.();
      router.refresh();
    });
  }

  function handleRecount() {
    if (note.trim().length < 3) {
      toast.error("Nhập lý do cần đếm lại.");
      return;
    }
    setPendingAction("recount");
    startTransition(async () => {
      const res = await requestCountRecount({ slipId: row.id, note });
      setPendingAction(null);
      if (!res.success) {
        toast.error(res.error ?? "Không gửi được yêu cầu đếm lại.");
        return;
      }
      toast.success("Đã yêu cầu nhân viên đếm lại.");
      setRecounting(false);
      setNote("");
      onRecount?.();
      router.refresh();
    });
  }

  return (
    <div role="listitem">
      <div
        className={cn(
          "rounded-lg border bg-card",
          !readOnly && hasShrinkage && "border-destructive/40",
        )}
      >
        <div className="flex items-start justify-between gap-2 p-4 pb-3">
          <div className="min-w-0">
            <div className="font-heading flex flex-wrap items-center gap-2 text-base font-semibold">
              {row.employeeName}
              {branchScoped ? null : (
                <Badge variant="outline" className="text-xs">
                  {row.branchName}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {row.locationName}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Ngày đếm {formatVNDate(row.countDate)}
              {row.submittedAt
                ? ` • Gửi ${formatVNDateTime(row.submittedAt)}`
                : ""}
            </p>
          </div>
          <StatusBadge domain="count-slip" value={row.status} />
        </div>

        <div className="flex flex-col gap-3 p-4 pt-0">
          <ItemGroup className="flex flex-col gap-2 p-0 rounded-none border-0">
            {row.lines.map((line) => (
              <Item
                key={line.id}
                variant="muted"
                className="rounded-md border bg-muted/20 p-3 text-sm flex flex-col items-stretch"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{line.ingredientName}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      <span>
                        Tồn hệ thống:{" "}
                        <span className="font-mono tabular-nums text-foreground">
                          {formatQty(line.systemQuantity)} {line.systemUnit}
                        </span>
                      </span>
                      <span>
                        Số đếm:{" "}
                        <span className="font-mono tabular-nums text-foreground">
                          {formatQty(line.countedQuantity)} {line.countedUnit}
                        </span>
                      </span>
                      {line.countedBaseQuantity !== null &&
                      line.countedUnit !== line.systemUnit ? (
                        <span>
                          Quy đổi:{" "}
                          <span className="font-mono tabular-nums text-foreground">
                            {formatQty(line.countedBaseQuantity)}{" "}
                            {line.systemUnit}
                          </span>
                        </span>
                      ) : null}
                    </div>
                    {line.note ? (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        {line.note}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <div
                      className={cn(
                        "font-mono text-sm font-semibold tabular-nums",
                        varianceClassName(line.variance),
                      )}
                    >
                      {formatVariance(line.variance)}
                      {line.variance !== null ? ` ${line.varianceUnit}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">Lệch</div>
                  </div>
                </div>
              </Item>
            ))}
          </ItemGroup>

          {row.note ? (
            <p className="text-xs italic text-muted-foreground">
              Ghi chú nhân viên: {row.note}
            </p>
          ) : null}

          {row.reviewNote ? (
            <p className="text-xs italic text-warning">
              Lý do đếm lại: {row.reviewNote}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {row.lines.length} dòng
            </span>
            <span
              className={cn(
                "font-mono font-semibold tabular-nums",
                varianceClassName(totalVariance),
              )}
            >
              {showTotalVariance
                ? `Tổng lệch ${formatVariance(totalVariance)} ${totalVarianceUnit}`
                : `${changedLineCount} dòng có lệch`}
            </span>
          </div>

          {!readOnly ? (
            <>
              {recounting ? (
                <div className="flex flex-col gap-2">
                  <Label>Lý do cần đếm lại</Label>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={pendingAction !== null}
                    rows={2}
                    placeholder="Ví dụ: số sườn lệch nhiều so với tồn, cần đếm lại kho mát"
                  />
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                {recounting ? (
                  <>
                    <Button
                      variant="outline"
                      size={embedded ? "touch" : "default"}
                      onClick={() => {
                        setRecounting(false);
                        setNote("");
                      }}
                      disabled={pendingAction !== null}
                    >
                      Hủy
                    </Button>
                    <Button
                      size={embedded ? "touch" : "default"}
                      onClick={handleRecount}
                      disabled={pendingAction !== null}
                    >
                      {pendingAction === "recount" ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <IconRecount data-icon="inline-start" />
                      )}
                      Gửi yêu cầu đếm lại
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size={embedded ? "touch" : "default"}
                      onClick={() => setRecounting(true)}
                      disabled={pendingAction !== null}
                    >
                      <IconRecount data-icon="inline-start" />
                      Yêu cầu đếm lại
                    </Button>
                    <Button
                      size={embedded ? "touch" : "default"}
                      onClick={handleApprove}
                      disabled={pendingAction !== null}
                    >
                      {pendingAction === "approve" ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <IconCheck data-icon="inline-start" />
                      )}
                      Duyệt
                    </Button>
                  </>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
