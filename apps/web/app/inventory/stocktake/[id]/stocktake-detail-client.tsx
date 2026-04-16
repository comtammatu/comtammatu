"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  Check,
  CheckCircle2,
  ClipboardCheck,
  XCircle,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@comtammatu/ui/components/alert-dialog";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";

import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { cn } from "@comtammatu/ui";
import { TableEmptyStateRow } from "../../_components/table-empty-state-row";
import { tRoute, tTerm } from "../../_lib/dictionary";
import {
  cancelStocktake,
  completeStocktake,
  fetchStocktakeDetail,
  updateStocktakeLine,
} from "../../actions";

/* ─── Types ─── */

interface StocktakeSession {
  id: number;
  branch_id: number;
  started_at: string | null;
  completed_at: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  created_by: string;
}

interface StocktakeLine {
  id: number;
  session_id: number;
  ingredient_id: number;
  system_quantity: number;
  counted_quantity: number | null;
  variance: number | null;
  variance_reason: string | null;
  ingredients: {
    id: number;
    name: string;
    unit: string;
    category: string | null;
  } | null;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  in_progress: {
    label: "Đang thực hiện",
    className: "bg-warning/10 text-warning border-warning/30",
  },
  completed: {
    label: "Hoàn tất",
    className: "bg-success/10 text-success border-success/30",
  },
  cancelled: {
    label: "Đã hủy",
    className: "bg-muted text-muted-foreground",
  },
};

export function StocktakeDetailClient({
  session: initialSession,
  lines: initialLines,
  routeBase = "/inventory/stocktake",
  inventoryBasePath = "/inventory",
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lines: any[];
  routeBase?: string;
  inventoryBasePath?: string;
}) {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const [session, setSession] = useState<StocktakeSession>(
    initialSession as StocktakeSession,
  );
  const [lines, setLines] = useState<StocktakeLine[]>(
    initialLines as StocktakeLine[],
  );
  const [savedLines, setSavedLines] = useState<Set<number>>(new Set());
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const meta = STATUS_META[session.status] ?? {
    label: session.status,
    className: "bg-muted text-muted-foreground",
  };

  const countedCount = useMemo(
    () => lines.filter((l) => l.counted_quantity != null).length,
    [lines],
  );

  const progressPct =
    lines.length > 0 ? Math.round((countedCount / lines.length) * 100) : 0;
  const varianceCount = useMemo(
    () => lines.filter((line) => (line.variance ?? 0) !== 0).length,
    [lines],
  );
  const headerDescription = [
    `Ngày tạo: ${new Date(session.created_at).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`,
    session.completed_at
      ? `Hoàn tất: ${new Date(session.completed_at).toLocaleDateString(
          "vi-VN",
          {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          },
        )}`
      : null,
    session.notes ? `Ghi chú: ${session.notes}` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  const refreshData = useCallback(() => {
    startTransition(async () => {
      const res = await fetchStocktakeDetail(session.id);
      if (res.success && res.data) {
        const d = res.data as {
          session: StocktakeSession;
          lines: StocktakeLine[];
        };
        setSession(d.session);
        setLines(d.lines);
      }
    });
  }, [session.id, startTransition]);

  function handleLineBlur(lineId: number, value: string) {
    const num = Number(value);
    if (value !== "" && Number.isFinite(num) && num >= 0) {
      const currentLine = lines.find((l) => l.id === lineId);
      if (currentLine && currentLine.counted_quantity !== num) {
        startTransition(async () => {
          const res = await updateStocktakeLine({
            lineId,
            countedQuantity: num,
            varianceReason: currentLine.variance_reason ?? undefined,
          });
          if (!res.success) {
            toast.error(res.error ?? "Không thể cập nhật");
          } else {
            setSavedLines((prev) => new Set(prev).add(lineId));
            refreshData();
          }
        });
      }
    }
  }

  function handleReasonBlur(lineId: number, reason: string) {
    const currentLine = lines.find((l) => l.id === lineId);
    if (!currentLine || currentLine.counted_quantity == null) return;
    if (currentLine.variance_reason === reason) return;

    startTransition(async () => {
      const res = await updateStocktakeLine({
        lineId,
        countedQuantity: currentLine.counted_quantity ?? 0,
        varianceReason: reason || undefined,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không thể cập nhật");
      } else {
        setSavedLines((prev) => new Set(prev).add(lineId));
        refreshData();
      }
    });
  }

  function handleComplete() {
    startTransition(async () => {
      const res = await completeStocktake(session.id);
      if (!res.success) {
        toast.error(res.error ?? "Không thể hoàn tất kiểm kê.");
        setCompleteDialogOpen(false);
        return;
      }
      toast.success("Đã hoàn tất kiểm kê");
      setCompleteDialogOpen(false);
      refreshData();
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const res = await cancelStocktake(session.id);
      if (!res.success) {
        toast.error(res.error ?? "Không thể hủy phiên kiểm kê.");
        setCancelDialogOpen(false);
        return;
      }
      toast.success("Đã hủy phiên kiểm kê");
      setCancelDialogOpen(false);
      refreshData();
    });
  }

  return (
    <>
      {/* Breadcrumb + Back */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="icon-lg" asChild>
          <Link href={routeBase}>
            <ArrowLeft className="size-4" />
            <span className="sr-only">Quay lại</span>
          </Link>
        </Button>
        <Link
          href={inventoryBasePath}
          className="hover:text-foreground transition-colors"
        >
          {tTerm("inventoryModule")}
        </Link>
        <span>/</span>
        <Link
          href={routeBase}
          className="hover:text-foreground transition-colors"
        >
          {tRoute("/inventory/stocktake")}
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">KK-{session.id}</span>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">
            Kiem soat cuoi ca
          </p>
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">
              {`KK-${session.id}`}
            </h1>
            <p className="text-sm text-muted-foreground">{headerDescription}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn("text-xs", meta.className)}>{meta.label}</Badge>
          {session.status === "in_progress" ? (
            <>
              <Button
                variant="outline"
                onClick={() => setCancelDialogOpen(true)}
                disabled={isPending}
              >
                <Ban className="mr-2 size-4" />
                Hủy kiểm kê
              </Button>
              <Button
                onClick={() => setCompleteDialogOpen(true)}
                disabled={isPending}
              >
                <CheckCircle2 className="mr-2 size-4" />
                Hoàn tất kiểm kê
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Trạng thái",
            value: meta.label,
          },
          {
            label: "Đã đếm",
            value: `${countedCount}/${lines.length}`,
          },
          {
            label: "Tiến độ",
            value: `${progressPct}%`,
          },
          {
            label: "Dòng lệch",
            value: String(varianceCount).padStart(2, "0"),
          },
        ].map((item) => (
          <Card key={item.label}><CardContent>
            <Badge variant="secondary">
              {item.label}
            </Badge>
            <p className="mt-3 text-xl font-semibold">{item.value}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* Progress (in_progress only) */}
      {session.status === "in_progress" && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-sm">
              <ClipboardCheck className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                Tiến độ:{" "}
                <span className="font-medium text-foreground">
                  {countedCount}/{lines.length}
                </span>{" "}
                đã đếm ({progressPct}%)
              </span>
              <div className="h-2 flex-1 max-w-48 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancelled state */}
      {session.status === "cancelled" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <XCircle className="size-8 text-muted-foreground" />
            <p className="text-base font-semibold">Phiên kiểm kê đã bị hủy</p>
            <p className="text-sm text-muted-foreground">
              Dữ liệu đếm trước đó không còn hiệu lực và phiên này không thể
              tiếp tục chỉnh sửa.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Counting phase (in_progress) */}
      {session.status === "in_progress" && (
        <CountingPhase
          lines={lines}
          savedLines={savedLines}
          isPending={isPending}
          isMobile={isMobile}
          onLineBlur={handleLineBlur}
          onReasonBlur={handleReasonBlur}
        />
      )}

      {/* Results phase (completed) */}
      {session.status === "completed" && (
        <ResultsPhase lines={lines} isMobile={isMobile} />
      )}

      {/* Complete confirm dialog */}
      <AlertDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chot ket qua kiem ke?</AlertDialogTitle>
            <AlertDialogDescription>
              Hanh dong nay se tinh chenh lech va cap nhat ton kho he thong. Sau
              khi chot, phien kiem ke se chuyen sang lop doi chieu ket qua.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleComplete} disabled={isPending}>
              {isPending ? "Dang xu ly..." : "Chot ket qua"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel confirm dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Huy phien kiem ke?</AlertDialogTitle>
            <AlertDialogDescription>
              Tat ca du lieu da dem se bi huy va khong con duoc doi chieu trong
              phien nay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Quay lại</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? "Đang xử lý..." : "Xác nhận hủy"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ─── CountingPhase ─── */

function CountingPhase({
  lines,
  savedLines,
  isPending,
  isMobile,
  onLineBlur,
  onReasonBlur,
}: {
  lines: StocktakeLine[];
  savedLines: Set<number>;
  isPending: boolean;
  isMobile: boolean;
  onLineBlur: (lineId: number, value: string) => void;
  onReasonBlur: (lineId: number, reason: string) => void;
}) {
  if (isMobile) {
    return (
      <Card className="overflow-hidden rounded-lg">
        <CardContent className="p-0">
          {lines.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-base font-semibold">
                Không có nguyên liệu để kiểm kê
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Kho hiện chưa có dòng tồn nào cần thực hiện kiểm kê trong phiên
                này.
              </p>
            </div>
          ) : (
            <div className="-m-4 divide-y md:-m-5">
              {lines.map((line) => (
                <div key={line.id} className="space-y-2 px-4 py-3 md:px-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {line.ingredients?.name ?? `#${line.ingredient_id}`}
                    </span>
                    {savedLines.has(line.id) && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-success">
                        <Check className="size-3" />
                        Đã lưu
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {line.ingredients?.unit ?? "—"}
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      defaultValue={
                        line.counted_quantity != null
                          ? String(line.counted_quantity)
                          : ""
                      }
                      placeholder="SL thực đếm"
                      className="h-8 flex-1 tabular-nums"
                      onBlur={(e) => onLineBlur(line.id, e.target.value)}
                      disabled={isPending}
                    />
                    <Input
                      type="text"
                      defaultValue={line.variance_reason ?? ""}
                      placeholder="Lý do"
                      className="h-8 flex-1 text-sm"
                      onBlur={(e) =>
                        onReasonBlur(line.id, e.target.value.trim())
                      }
                      disabled={isPending}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-lg">
      <CardContent className="p-0">
        <div className="-m-4 md:-m-5">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  {tTerm("ingredient")}
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Đơn vị
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  SL thực đếm
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Lý do chênh lệch
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 && (
                <TableEmptyStateRow
                  colSpan={4}
                  paddingClassName="py-14"
                  title="Không có nguyên liệu để kiểm kê"
                  description="Kho hiện chưa có dòng tồn nào cần thực hiện kiểm kê trong phiên này."
                />
              )}
              {lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="text-sm font-medium">
                    <div className="flex items-center gap-2">
                      {line.ingredients?.name ?? `#${line.ingredient_id}`}
                      {savedLines.has(line.id) && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-success">
                          <Check className="size-3" />
                          Đã lưu
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {line.ingredients?.unit ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      defaultValue={
                        line.counted_quantity != null
                          ? String(line.counted_quantity)
                          : ""
                      }
                      placeholder="0"
                      className="h-8 w-24 tabular-nums"
                      onBlur={(e) => onLineBlur(line.id, e.target.value)}
                      disabled={isPending}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="text"
                      defaultValue={line.variance_reason ?? ""}
                      placeholder="Lý do (tùy chọn)"
                      className="h-8 w-48 text-sm"
                      onBlur={(e) =>
                        onReasonBlur(line.id, e.target.value.trim())
                      }
                      disabled={isPending}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── ResultsPhase ─── */

function getVarianceColor(line: StocktakeLine): string {
  if (line.variance == null || line.system_quantity === 0) return "";
  const ratio = Math.abs(line.variance) / line.system_quantity;
  if (ratio < 0.01) return "text-success";
  if (ratio < 0.05) return "text-warning";
  return "text-destructive";
}

function getVarianceBg(line: StocktakeLine): string {
  if (line.variance == null || line.system_quantity === 0) return "";
  const ratio = Math.abs(line.variance) / line.system_quantity;
  if (ratio < 0.01) return "bg-success/5";
  if (ratio < 0.05) return "bg-warning/5";
  return "bg-destructive/5";
}

function ResultsPhase({
  lines,
  isMobile,
}: {
  lines: StocktakeLine[];
  isMobile: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* Variance legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="text-muted-foreground font-medium">Chênh lệch:</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-success" />
          {"<"}1% (tốt)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-warning" />
          1–5% (cần xem lại)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-destructive" />
          {">"}5% (nghiêm trọng)
        </span>
      </div>

      {isMobile ? (
        <Card className="overflow-hidden rounded-lg">
          <CardContent className="p-0">
            {lines.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-base font-semibold">
                  Không có dữ liệu kiểm kê
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Kết quả chênh lệch sẽ xuất hiện tại đây sau khi phiên kiểm kê
                  có dữ liệu.
                </p>
              </div>
            ) : (
              <div className="-m-4 divide-y md:-m-5">
                {lines.map((line) => {
                  const varianceColor = getVarianceColor(line);
                  const variance = line.variance ?? 0;
                  return (
                    <div
                      key={line.id}
                      className={cn(
                        "space-y-1 px-4 py-3 md:px-5",
                        getVarianceBg(line),
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {line.ingredients?.name ?? `#${line.ingredient_id}`}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 font-mono text-sm font-medium tabular-nums",
                            varianceColor,
                          )}
                        >
                          {variance > 0 && "+"}
                          {variance}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>
                          HT: {line.system_quantity} · Đếm:{" "}
                          {line.counted_quantity ?? "—"}
                        </span>
                        <span className="truncate text-right">
                          {line.variance_reason ?? ""}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-lg">
          <CardContent className="p-0">
            <div className="-m-4 md:-m-5">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      {tTerm("ingredient")}
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      Đơn vị
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      SL hệ thống
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      SL thực đếm
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      Chênh lệch
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      Lý do
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 && (
                    <TableEmptyStateRow
                      colSpan={6}
                      paddingClassName="py-14"
                      title="Không có dữ liệu kiểm kê"
                      description="Kết quả chênh lệch sẽ xuất hiện tại đây sau khi phiên kiểm kê có dữ liệu."
                    />
                  )}
                  {lines.map((line) => {
                    const varianceColor = getVarianceColor(line);
                    const variance = line.variance ?? 0;

                    return (
                      <TableRow key={line.id} className={getVarianceBg(line)}>
                        <TableCell className="text-sm font-medium">
                          {line.ingredients?.name ?? `#${line.ingredient_id}`}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {line.ingredients?.unit ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {line.system_quantity}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {line.counted_quantity ?? "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-sm font-medium tabular-nums",
                            varianceColor,
                          )}
                        >
                          {variance > 0 && "+"}
                          {variance}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {line.variance_reason ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
