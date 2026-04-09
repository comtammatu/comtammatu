"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Ban,
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
import {
  cancelStocktake,
  completeStocktake,
  fetchStocktakeDetail,
  updateStocktakeLine,
} from "../../actions";

/* ─── Types (as any casts, migration not applied) ─── */

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
    label: "\u0110ang th\u1ef1c hi\u1ec7n",
    className: "bg-warning/10 text-warning border-warning/30",
  },
  completed: {
    label: "Ho\u00e0n t\u1ea5t",
    className: "bg-success/10 text-success border-success/30",
  },
  cancelled: {
    label: "\u0110\u00e3 h\u1ee7y",
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
  const [isPending, startTransition] = useTransition();
  const [session, setSession] = useState<StocktakeSession>(
    initialSession as StocktakeSession,
  );
  const [lines, setLines] = useState<StocktakeLine[]>(
    initialLines as StocktakeLine[],
  );
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

  function handleLineBlur(
    lineId: number,
    value: string,
    field: "counted_quantity",
  ) {
    const num = Number(value);
    if (
      field === "counted_quantity" &&
      value !== "" &&
      Number.isFinite(num) &&
      num >= 0
    ) {
      const currentLine = lines.find((l) => l.id === lineId);
      if (currentLine && currentLine.counted_quantity !== num) {
        startTransition(async () => {
          const res = await updateStocktakeLine({
            lineId,
            countedQuantity: num,
            varianceReason: currentLine.variance_reason ?? undefined,
          });
          if (!res.success) {
            toast.error(res.error ?? "Kh\u00f4ng th\u1ec3 c\u1eadp nh\u1eadt");
          } else {
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
        toast.error(res.error ?? "Kh\u00f4ng th\u1ec3 c\u1eadp nh\u1eadt");
      } else {
        refreshData();
      }
    });
  }

  function handleComplete() {
    startTransition(async () => {
      const res = await completeStocktake(session.id);
      if (!res.success) {
        toast.error(
          res.error ??
            "Kh\u00f4ng th\u1ec3 ho\u00e0n t\u1ea5t ki\u1ec3m k\u00ea.",
        );
        setCompleteDialogOpen(false);
        return;
      }
      toast.success("\u0110\u00e3 ho\u00e0n t\u1ea5t ki\u1ec3m k\u00ea");
      setCompleteDialogOpen(false);
      refreshData();
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const res = await cancelStocktake(session.id);
      if (!res.success) {
        toast.error(
          res.error ??
            "Kh\u00f4ng th\u1ec3 h\u1ee7y phi\u00ean ki\u1ec3m k\u00ea.",
        );
        setCancelDialogOpen(false);
        return;
      }
      toast.success("\u0110\u00e3 h\u1ee7y phi\u00ean ki\u1ec3m k\u00ea");
      setCancelDialogOpen(false);
      refreshData();
    });
  }

  function getVarianceColor(line: StocktakeLine): string {
    if (line.variance == null || line.system_quantity === 0) return "";
    const ratio = Math.abs(line.variance) / line.system_quantity;
    if (ratio < 0.01) return "text-success";
    if (ratio < 0.05) return "text-warning";
    return "text-destructive";
  }

  return (
    <>
      {/* Breadcrumb + Back */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="icon" className="size-8" asChild>
          <Link href="/admin/inventory/stocktake">
            <ArrowLeft className="size-4" />
            <span className="sr-only">Quay l\u1ea1i</span>
          </Link>
        </Button>
        <Link
          href="/admin/inventory"
          className="hover:text-foreground transition-colors"
        >
          Kho h\u00e0ng
        </Link>
        <span>/</span>
        <Link
          href="/admin/inventory/stocktake"
          className="hover:text-foreground transition-colors"
        >
          Ki\u1ec3m k\u00ea
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">KK-{session.id}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              KK-{session.id}
            </h1>
            <Badge className={cn("text-xs", meta.className)}>
              {meta.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Ng\u00e0y t\u1ea1o:{" "}
            {new Date(session.created_at).toLocaleDateString("vi-VN", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {session.completed_at && (
              <>
                {" \u2022 "}Ho\u00e0n t\u1ea5t:{" "}
                {new Date(session.completed_at).toLocaleDateString("vi-VN", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </>
            )}
          </p>
          {session.notes && (
            <p className="text-sm text-muted-foreground">
              Ghi ch\u00fa: {session.notes}
            </p>
          )}
        </div>

        {session.status === "in_progress" && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(true)}
              disabled={isPending}
            >
              <Ban className="mr-2 size-4" />
              H\u1ee7y ki\u1ec3m k\u00ea
            </Button>
            <Button
              onClick={() => setCompleteDialogOpen(true)}
              disabled={isPending}
            >
              <CheckCircle2 className="mr-2 size-4" />
              Ho\u00e0n t\u1ea5t ki\u1ec3m k\u00ea
            </Button>
          </div>
        )}
      </div>

      {/* Progress (in_progress only) */}
      {session.status === "in_progress" && (
        <div className="flex items-center gap-2 text-sm">
          <ClipboardCheck className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            Ti\u1ebfn \u0111\u1ed9:{" "}
            <span className="font-medium text-foreground">
              {countedCount}/{lines.length}
            </span>{" "}
            \u0111\u00e3 \u0111\u1ebfm
          </span>
        </div>
      )}

      {/* Cancelled state */}
      {session.status === "cancelled" && (
        <div className="flex items-center gap-3 rounded-lg border border-muted bg-muted/30 px-4 py-6">
          <XCircle className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Phi\u00ean ki\u1ec3m k\u00ea n\u00e0y \u0111\u00e3 b\u1ecb h\u1ee7y.
          </p>
        </div>
      )}

      {/* Counting table (in_progress) */}
      {session.status === "in_progress" && (
        <div className="overflow-hidden rounded-lg border shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Nguy\u00ean li\u1ec7u
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  \u0110\u01a1n v\u1ecb
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  SL th\u1ef1c \u0111\u1ebfm
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  L\u00fd do ch\u00eanh l\u1ec7ch
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-12 text-center text-muted-foreground"
                  >
                    Kh\u00f4ng c\u00f3 nguy\u00ean li\u1ec7u n\u00e0o trong kho
                    \u0111\u1ec3 ki\u1ec3m k\u00ea.
                  </TableCell>
                </TableRow>
              )}
              {lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="text-sm font-medium">
                    {line.ingredients?.name ?? `#${line.ingredient_id}`}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {line.ingredients?.unit ?? "\u2014"}
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
                      onBlur={(e) =>
                        handleLineBlur(
                          line.id,
                          e.target.value,
                          "counted_quantity",
                        )
                      }
                      disabled={isPending}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="text"
                      defaultValue={line.variance_reason ?? ""}
                      placeholder="L\u00fd do (tu\u1ef3 ch\u1ecdn)"
                      className="h-8 w-48 text-sm"
                      onBlur={(e) =>
                        handleReasonBlur(line.id, e.target.value.trim())
                      }
                      disabled={isPending}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Results table (completed) */}
      {session.status === "completed" && (
        <div className="overflow-hidden rounded-lg border shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Nguy\u00ean li\u1ec7u
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  \u0110\u01a1n v\u1ecb
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  SL h\u1ec7 th\u1ed1ng
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  SL th\u1ef1c \u0111\u1ebfm
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Ch\u00eanh l\u1ec7ch
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  L\u00fd do
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-12 text-center text-muted-foreground"
                  >
                    Kh\u00f4ng c\u00f3 d\u1eef li\u1ec7u ki\u1ec3m k\u00ea.
                  </TableCell>
                </TableRow>
              )}
              {lines.map((line) => {
                const varianceColor = getVarianceColor(line);
                const variance = line.variance ?? 0;

                return (
                  <TableRow key={line.id}>
                    <TableCell className="text-sm font-medium">
                      {line.ingredients?.name ?? `#${line.ingredient_id}`}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {line.ingredients?.unit ?? "\u2014"}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {line.system_quantity}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {line.counted_quantity ?? "\u2014"}
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
                      {line.variance_reason ?? "\u2014"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Complete confirm dialog */}
      <AlertDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Ho\u00e0n t\u1ea5t ki\u1ec3m k\u00ea?
            </AlertDialogTitle>
            <AlertDialogDescription>
              H\u00e0nh \u0111\u1ed9ng n\u00e0y s\u1ebd t\u00ednh ch\u00eanh
              l\u1ec7ch v\u00e0 c\u1eadp nh\u1eadt t\u1ed3n kho. B\u1ea1n
              kh\u00f4ng th\u1ec3 ho\u00e0n t\u00e1c sau khi ho\u00e0n t\u1ea5t.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>H\u1ee7y</AlertDialogCancel>
            <AlertDialogAction onClick={handleComplete} disabled={isPending}>
              {isPending
                ? "\u0110ang x\u1eed l\u00fd..."
                : "Ho\u00e0n t\u1ea5t"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel confirm dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              H\u1ee7y phi\u00ean ki\u1ec3m k\u00ea?
            </AlertDialogTitle>
            <AlertDialogDescription>
              T\u1ea5t c\u1ea3 d\u1eef li\u1ec7u \u0111\u00e3 \u0111\u1ebfm
              s\u1ebd b\u1ecb h\u1ee7y. B\u1ea1n c\u00f3 ch\u1eafc kh\u00f4ng?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              Quay l\u1ea1i
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending
                ? "\u0110ang x\u1eed l\u00fd..."
                : "X\u00e1c nh\u1eadn h\u1ee7y"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
