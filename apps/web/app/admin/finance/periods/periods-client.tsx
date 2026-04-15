"use client";

import React, { useState, useTransition } from "react";
import { SectionCard } from "@/components/patterns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@comtammatu/ui/components/dialog";
import { Lock, Plus, FileSearch } from "lucide-react";
import {
  openFiscalPeriod,
  closeFiscalPeriod,
  fetchReconciliation,
} from "../period-actions";
import type { FiscalPeriodRow, ReconciliationItem } from "./page";

interface Props {
  periods: FiscalPeriodRow[];
}

const STATUS_LABEL: Record<string, string> = {
  open: "Đang mở",
  closing: "Đang đóng",
  closed: "Đã đóng",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  open: "default",
  closing: "secondary",
  closed: "outline",
};

function formatPeriod(month: number, year: number) {
  return `T${String(month).padStart(2, "0")}/${year}`;
}

export function PeriodsClient({ periods: initial }: Props) {
  const [periods, setPeriods] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Close dialog state
  const [closeTarget, setCloseTarget] = useState<FiscalPeriodRow | null>(null);

  // Reconciliation dialog state
  const [reconTarget, setReconTarget] = useState<{
    year: number;
    month: number;
  } | null>(null);
  const [reconData, setReconData] = useState<ReconciliationItem[] | null>(null);
  const [reconLoading, setReconLoading] = useState(false);

  function handleOpenCurrent() {
    setError(null);
    const now = new Date();
    startTransition(async () => {
      const res = await openFiscalPeriod({
        year: now.getFullYear(),
        month: now.getMonth() + 1,
      });
      if (!res.success) {
        setError(res.error ?? "Lỗi không xác định");
        return;
      }
      const newPeriod = res.data as FiscalPeriodRow;
      setPeriods((prev) => {
        const idx = prev.findIndex((p) => p.id === newPeriod.id);
        if (idx >= 0) {
          // Upsert returned existing — merge updated data
          const updated = [...prev];
          updated[idx] = { ...prev[idx]!, ...newPeriod };
          return updated;
        }
        return [newPeriod, ...prev];
      });
    });
  }

  function handleClose(period: FiscalPeriodRow) {
    setCloseTarget(period);
  }

  function confirmClose() {
    if (!closeTarget) return;
    setError(null);
    startTransition(async () => {
      const res = await closeFiscalPeriod({
        year: closeTarget.period_year,
        month: closeTarget.period_month,
      });
      if (!res.success) {
        setError(res.error ?? "Lỗi không xác định");
        setCloseTarget(null);
        return;
      }

      const result = res.data as {
        period_id: number;
        status: string;
        has_discrepancies: boolean;
        reconciliation: ReconciliationItem[];
      };

      setPeriods((prev) =>
        prev.map((p) =>
          p.id === closeTarget.id
            ? {
                ...p,
                status: "closed",
                closed_at: new Date().toISOString(),
                notes: result.has_discrepancies
                  ? (p.notes ?? "") + " [Có chênh lệch]"
                  : p.notes,
              }
            : p,
        ),
      );

      // Show reconciliation results
      setReconTarget({
        year: closeTarget.period_year,
        month: closeTarget.period_month,
      });
      setReconData(result.reconciliation);
      setCloseTarget(null);
    });
  }

  function handleViewRecon(year: number, month: number) {
    setReconLoading(true);
    setReconTarget({ year, month });
    setReconData(null);

    fetchReconciliation({ year, month }).then((res) => {
      setReconLoading(false);
      if (res.success) {
        setReconData((res.data ?? []) as ReconciliationItem[]);
      }
    });
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div />
        <Button onClick={handleOpenCurrent} size="sm" disabled={isPending}>
          <Plus className="mr-1.5 size-4" />
          Mở kỳ tháng hiện tại
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <SectionCard className="overflow-hidden" density="compact">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Kỳ</TableHead>
              <TableHead className="w-28">Trạng thái</TableHead>
              <TableHead>Ngày đóng</TableHead>
              <TableHead>Ghi chú</TableHead>
              <TableHead className="w-48 text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-muted-foreground"
                >
                  Chưa có kỳ kế toán nào. Nhấn &quot;Mở kỳ tháng hiện tại&quot;
                  để bắt đầu.
                </TableCell>
              </TableRow>
            ) : (
              periods.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium tabular-nums">
                    {formatPeriod(p.period_month, p.period_year)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[p.status] ?? "secondary"}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.closed_at
                      ? new Date(p.closed_at).toLocaleDateString("vi-VN")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {p.notes ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleViewRecon(p.period_year, p.period_month)
                        }
                      >
                        <FileSearch className="mr-1 size-3.5" />
                        Đối chiếu
                      </Button>
                      {p.status === "open" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleClose(p)}
                          disabled={isPending}
                        >
                          <Lock className="mr-1 size-3.5" />
                          Đóng kỳ
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </SectionCard>

      {/* Close confirmation dialog */}
      <Dialog
        open={closeTarget !== null}
        onOpenChange={() => setCloseTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận đóng kỳ kế toán</DialogTitle>
            <DialogDescription>
              Đóng kỳ{" "}
              {closeTarget &&
                formatPeriod(closeTarget.period_month, closeTarget.period_year)}
              ? Sau khi đóng, không thể ghi sổ bút toán vào kỳ này.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Hệ thống sẽ làm mới báo cáo, chạy đối chiếu GL, và khóa kỳ.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseTarget(null)}>
              Hủy
            </Button>
            <Button onClick={confirmClose} disabled={isPending}>
              Đóng kỳ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reconciliation results dialog */}
      <Dialog
        open={reconTarget !== null}
        onOpenChange={() => {
          setReconTarget(null);
          setReconData(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              Đối chiếu GL —{" "}
              {reconTarget && formatPeriod(reconTarget.month, reconTarget.year)}
            </DialogTitle>
          </DialogHeader>
          {reconLoading ? (
            <p className="py-6 text-center text-muted-foreground">
              Đang tải...
            </p>
          ) : reconData ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mục</TableHead>
                    <TableHead className="w-32 text-right">
                      Chứng từ gốc
                    </TableHead>
                    <TableHead className="w-32 text-right">GL</TableHead>
                    <TableHead className="w-28 text-right">
                      Chênh lệch
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconData.map((item, i) => {
                    const hasDiff = Math.abs(item.difference) > 1;
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-sm">
                          {item.category}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(item.subledger_total).toLocaleString("vi-VN")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(item.gl_total).toLocaleString("vi-VN")}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-medium ${hasDiff ? "text-destructive" : "text-emerald-600"}`}
                        >
                          {hasDiff
                            ? Number(item.difference).toLocaleString("vi-VN")
                            : "0"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="py-6 text-center text-muted-foreground">
              Không có dữ liệu.
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReconTarget(null);
                setReconData(null);
              }}
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
