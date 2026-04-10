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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import {
  cancelStocktake,
  completeStocktake,
  fetchStocktakeDetail,
  updateStocktakeLine,
} from "../../actions";
import { StatusBadge } from "../../_components/shared";

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
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lines: any[];
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
      {/* Back link */}
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/inventory/stocktake">
          <ArrowLeft className="mr-1.5 size-4" />
          Danh sách kiểm kê
        </Link>
      </Button>

      {/* Identity Card Header */}
      <section
        className="relative overflow-hidden rounded-2xl ambient-shadow p-6"
        style={{ backgroundColor: "var(--md-surface-lowest)" }}
      >
        <div className="absolute right-6 top-6">
          <StatusBadge status={session.status} label={meta.label} />
        </div>

        <div className="space-y-4">
          <div>
            <p
              className="mb-1 text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              Phiên kiểm kê
            </p>
            <h1
              className="text-2xl font-black tracking-tight font-mono"
              style={{ color: "var(--md-primary)" }}
            >
              KK-{session.id}
            </h1>
          </div>

          <div
            className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            <span>
              Ngày tạo:{" "}
              {new Date(session.created_at).toLocaleDateString("vi-VN", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {session.completed_at && (
              <span>
                Hoàn tất:{" "}
                {new Date(session.completed_at).toLocaleDateString("vi-VN", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>

          {session.notes && (
            <p
              className="text-sm italic"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              Ghi chú: {session.notes}
            </p>
          )}

          {/* Progress bar (in_progress only) */}
          {session.status === "in_progress" && (
            <div className="flex items-center gap-3 text-sm">
              <ClipboardCheck
                className="size-4"
                style={{ color: "var(--md-on-surface-variant)" }}
              />
              <span style={{ color: "var(--md-on-surface-variant)" }}>
                Tiến độ:{" "}
                <strong style={{ color: "var(--md-on-surface)" }}>
                  {countedCount}/{lines.length}
                </strong>{" "}
                đã đếm ({progressPct}%)
              </span>
              <div
                className="h-2 flex-1 max-w-48 rounded-full"
                style={{ backgroundColor: "var(--md-surface-high)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progressPct}%`,
                    background:
                      "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Action buttons bar */}
        {session.status === "in_progress" && (
          <div
            className="mt-6 flex flex-wrap items-center gap-2 border-t pt-4"
            style={{
              borderColor:
                "color-mix(in srgb, var(--md-outline-variant) 15%, transparent)",
            }}
          >
            <button
              type="button"
              className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all"
              style={{
                backgroundColor: "var(--md-surface-high)",
                color: "var(--md-on-surface-variant)",
              }}
              onClick={() => setCancelDialogOpen(true)}
              disabled={isPending}
            >
              <Ban className="size-4" />
              Hủy kiểm kê
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white transition-all hover:scale-[0.98]"
              style={{
                background:
                  "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
                boxShadow: "0 4px 14px rgba(211,84,0,0.2)",
              }}
              onClick={() => setCompleteDialogOpen(true)}
              disabled={isPending}
            >
              <CheckCircle2 className="size-4" />
              Hoàn tất kiểm kê
            </button>
          </div>
        )}
      </section>

      {/* Cancelled state */}
      {session.status === "cancelled" && (
        <div
          className="flex items-center gap-3 rounded-2xl px-6 py-6 ambient-shadow"
          style={{
            backgroundColor: "var(--md-surface-lowest)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
          }}
        >
          <XCircle
            className="size-5"
            style={{ color: "var(--md-on-surface-variant)" }}
          />
          <p
            className="text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Phiên kiểm kê này đã bị hủy.
          </p>
        </div>
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
            <AlertDialogTitle>Hoàn tất kiểm kê?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này sẽ tính chênh lệch và cập nhật tồn kho. Bạn không
              thể hoàn tác sau khi hoàn tất.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleComplete} disabled={isPending}>
              {isPending ? "Đang xử lý..." : "Hoàn tất"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel confirm dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hủy phiên kiểm kê?</AlertDialogTitle>
            <AlertDialogDescription>
              Tất cả dữ liệu đã đếm sẽ bị hủy. Bạn có chắc không?
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
      <div
        className="overflow-hidden rounded-2xl ambient-shadow divide-y"
        style={{
          backgroundColor: "var(--md-surface-lowest)",
          border:
            "1px solid color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
        }}
      >
        {lines.length === 0 && (
          <div
            className="py-12 text-center text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Không có nguyên liệu nào trong kho để kiểm kê.
          </div>
        )}
        {lines.map((line) => (
          <div
            key={line.id}
            className="p-3 space-y-2"
            style={{
              borderColor:
                "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="font-medium text-sm truncate"
                style={{ color: "var(--md-on-surface)" }}
              >
                {line.ingredients?.name ?? `#${line.ingredient_id}`}
              </span>
              {savedLines.has(line.id) && (
                <span className="inline-flex items-center gap-1 text-xs text-success shrink-0">
                  <Check className="size-3" />
                  Đã lưu
                </span>
              )}
            </div>
            <p
              className="text-xs"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
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
                onBlur={(e) => onReasonBlur(line.id, e.target.value.trim())}
                disabled={isPending}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-3xl ambient-shadow"
      style={{
        backgroundColor: "var(--md-surface-lowest)",
        border:
          "1px solid color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
      }}
    >
      <Table>
        <TableHeader>
          <TableRow
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
            }}
          >
            <TableHead
              className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              Nguyên liệu
            </TableHead>
            <TableHead
              className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              Đơn vị
            </TableHead>
            <TableHead
              className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              SL thực đếm
            </TableHead>
            <TableHead
              className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              Lý do chênh lệch
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={4}
                className="py-12 text-center"
                style={{ color: "var(--md-on-surface-variant)" }}
              >
                Không có nguyên liệu nào trong kho để kiểm kê.
              </TableCell>
            </TableRow>
          )}
          {lines.map((line) => (
            <TableRow
              key={line.id}
              className="group transition-colors"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
              }}
            >
              <TableCell className="px-6 py-4 text-sm font-medium">
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
              <TableCell
                className="px-6 py-4 text-sm"
                style={{ color: "var(--md-on-surface-variant)" }}
              >
                {line.ingredients?.unit ?? "—"}
              </TableCell>
              <TableCell className="px-6 py-4">
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
              <TableCell className="px-6 py-4">
                <Input
                  type="text"
                  defaultValue={line.variance_reason ?? ""}
                  placeholder="Lý do (tùy chọn)"
                  className="h-8 w-48 text-sm"
                  onBlur={(e) => onReasonBlur(line.id, e.target.value.trim())}
                  disabled={isPending}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
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
      <div
        className="flex flex-wrap items-center gap-4 text-xs"
        style={{ color: "var(--md-on-surface-variant)" }}
      >
        <span className="font-medium">Chênh lệch:</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-success" />
          {"<"}1% (tốt)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-warning" />
          1-5% (cần xem lại)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-destructive" />
          {">"}5% (nghiêm trọng)
        </span>
      </div>

      {isMobile ? (
        <div
          className="overflow-hidden rounded-2xl ambient-shadow divide-y"
          style={{
            backgroundColor: "var(--md-surface-lowest)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
          }}
        >
          {lines.length === 0 && (
            <div
              className="py-12 text-center text-sm"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              Không có dữ liệu kiểm kê.
            </div>
          )}
          {lines.map((line) => {
            const varianceColor = getVarianceColor(line);
            const variance = line.variance ?? 0;
            return (
              <div
                key={line.id}
                className={cn("p-3 space-y-1", getVarianceBg(line))}
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="font-medium text-sm truncate"
                    style={{ color: "var(--md-on-surface)" }}
                  >
                    {line.ingredients?.name ?? `#${line.ingredient_id}`}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-medium font-mono tabular-nums shrink-0",
                      varianceColor,
                    )}
                  >
                    {variance > 0 && "+"}
                    {variance}
                  </span>
                </div>
                <div
                  className="flex items-center justify-between text-xs"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  <span>
                    HT: {line.system_quantity} · Đếm:{" "}
                    {line.counted_quantity ?? "—"}
                  </span>
                  <span>{line.variance_reason ?? ""}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <section
          className="overflow-hidden rounded-3xl ambient-shadow"
          style={{
            backgroundColor: "var(--md-surface-lowest)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
          }}
        >
          <Table>
            <TableHeader>
              <TableRow
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
                }}
              >
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Nguyên liệu
                </TableHead>
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Đơn vị
                </TableHead>
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  SL hệ thống
                </TableHead>
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  SL thực đếm
                </TableHead>
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Chênh lệch
                </TableHead>
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Lý do
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-12 text-center"
                    style={{ color: "var(--md-on-surface-variant)" }}
                  >
                    Không có dữ liệu kiểm kê.
                  </TableCell>
                </TableRow>
              )}
              {lines.map((line) => {
                const varianceColor = getVarianceColor(line);
                const variance = line.variance ?? 0;

                return (
                  <TableRow
                    key={line.id}
                    className={cn(
                      "group transition-colors",
                      getVarianceBg(line),
                    )}
                    style={{
                      borderColor:
                        "color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
                    }}
                  >
                    <TableCell className="px-6 py-4 text-sm font-medium">
                      {line.ingredients?.name ?? `#${line.ingredient_id}`}
                    </TableCell>
                    <TableCell
                      className="px-6 py-4 text-sm"
                      style={{ color: "var(--md-on-surface-variant)" }}
                    >
                      {line.ingredients?.unit ?? "—"}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-sm tabular-nums">
                      {line.system_quantity}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-sm tabular-nums">
                      {line.counted_quantity ?? "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "px-6 py-4 text-sm font-medium tabular-nums",
                        varianceColor,
                      )}
                    >
                      {variance > 0 && "+"}
                      {variance}
                    </TableCell>
                    <TableCell
                      className="px-6 py-4 text-sm"
                      style={{ color: "var(--md-on-surface-variant)" }}
                    >
                      {line.variance_reason ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
