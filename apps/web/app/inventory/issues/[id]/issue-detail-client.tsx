"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  FileText,
  LogOut,
  Trash2,
  XCircle,
} from "lucide-react";
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
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { IngredientCombobox } from "../../ingredient-combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import {
  cancelStockIssue,
  confirmStockIssue,
  deleteStockIssueLine,
  fetchStockIssueDetail,
  upsertStockIssueLine,
} from "../../issue-actions";
import type { IngredientRow } from "../../page";
import { StatusBadge } from "../../_components/shared";

interface IssueRecord {
  id: number;
  issue_number: string;
  issue_type: string;
  status: string;
  notes: string | null;
  issued_at: string;
  branch_id: number;
  branches: { id: number; name: string } | null;
}

interface LineRow {
  id: number;
  ingredient_id: number;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  reason: string | null;
  ingredients: { id: number; name: string; unit: string } | null;
}

type IssueStatus = "draft" | "confirmed" | "cancelled";

const STATUS_STEPS: { key: IssueStatus; label: string }[] = [
  { key: "draft", label: "Nháp" },
  { key: "confirmed", label: "Đã xuất kho" },
];

const TYPE_LABEL: Record<string, string> = {
  consumption: "Tiêu hao",
  writeoff: "Thanh lý",
  kitchen_use: "Bếp dùng",
  other: "Khác",
};

export function IssueDetailClient({
  issueId,
  initialIssue,
  initialLines,
  ingredients,
}: {
  issueId: number;
  initialIssue: IssueRecord;
  initialLines: LineRow[];
  ingredients: IngredientRow[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [issue, setIssue] = useState(initialIssue);
  const [lines, setLines] = useState(initialLines);
  const [isPending, startTransition] = useTransition();
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmIssueOpen, setConfirmIssueOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const isDraft = issue.status === "draft";
  const grandTotal = lines.reduce((sum, l) => sum + l.total_cost, 0);

  async function reload() {
    const res = await fetchStockIssueDetail(issueId);
    if (!res.success || !res.data) {
      toast.error("Không tải lại được");
      return;
    }
    const d = res.data as { issue: IssueRecord; lines: LineRow[] };
    setIssue(d.issue);
    setLines(d.lines);
    router.refresh();
  }

  function removeLine(itemId: number) {
    startTransition(async () => {
      const res = await deleteStockIssueLine({ issueId, itemId });
      if (!res.success) {
        toast.error(res.error ?? "Không xóa được dòng");
        return;
      }
      toast.success("Đã xóa dòng");
      await reload();
    });
  }

  function doConfirm() {
    startTransition(async () => {
      const res = await confirmStockIssue(issueId);
      if (!res.success) {
        toast.error(res.error ?? "Không xác nhận được");
        return;
      }
      toast.success("Đã xuất kho và trừ tồn kho");
      setConfirmIssueOpen(false);
      await reload();
    });
  }

  function doCancel() {
    startTransition(async () => {
      const res = await cancelStockIssue(issueId);
      if (!res.success) {
        toast.error(res.error ?? "Không hủy được");
        return;
      }
      toast.success("Đã hủy phiếu xuất");
      await reload();
    });
  }

  function confirmDeleteLine() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    removeLine(id);
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/inventory/issues">
          <ArrowLeft className="mr-1.5 size-4" />
          Danh sách phiếu xuất
        </Link>
      </Button>

      {/* Header card */}
      <IssueHeaderCard
        issue={issue}
        lines={lines}
        grandTotal={grandTotal}
        isDraft={isDraft}
        isPending={isPending}
        onConfirm={() => setConfirmIssueOpen(true)}
        onCancel={() => setConfirmCancelOpen(true)}
      />

      {/* Line items */}
      <IssueLineItemsTable
        lines={lines}
        isDraft={isDraft}
        isPending={isPending}
        isMobile={isMobile}
        onDeleteLine={(id) => setPendingDeleteId(id)}
      />

      {/* Confirm issue dialog — with impact preview */}
      <AlertDialog open={confirmIssueOpen} onOpenChange={setConfirmIssueOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xuất kho?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Thao tác này sẽ trừ tồn kho và không thể hoàn tác.</p>
                {lines.length > 0 && (
                  <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
                    {lines.map((l) => (
                      <p key={l.id}>
                        Trừ{" "}
                        <strong>
                          {l.quantity.toLocaleString("vi-VN")} {l.unit}
                        </strong>{" "}
                        <strong>
                          {l.ingredients?.name ?? `#${l.ingredient_id}`}
                        </strong>{" "}
                        từ kho <strong>{issue.branches?.name ?? "—"}</strong>
                      </p>
                    ))}
                    <p className="pt-1 font-semibold border-t mt-2">
                      Tổng: {grandTotal.toLocaleString("vi-VN")} ₫
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={doConfirm} disabled={isPending}>
              {isPending ? "Đang xử lý…" : "Xác nhận xuất kho"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm cancel dialog */}
      <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hủy phiếu xuất?</AlertDialogTitle>
            <AlertDialogDescription>
              Phiếu xuất sẽ bị hủy và không thể hoàn tác. Bạn có chắc không?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Không hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={doCancel}
            >
              Xác nhận hủy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm delete line dialog */}
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa dòng hàng?</AlertDialogTitle>
            <AlertDialogDescription>
              Dòng này sẽ bị xóa khỏi phiếu xuất. Bạn có chắc không?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteLine}
            >
              Xóa dòng
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add line form — draft only */}
      {isDraft && (
        <AddIssueLineForm
          issueId={issueId}
          ingredients={ingredients}
          isPending={isPending}
          onSaved={reload}
          startTransition={startTransition}
        />
      )}
    </div>
  );
}

/* ─── IssueHeaderCard ─── */

function IssueHeaderCard({
  issue,
  lines,
  grandTotal,
  isDraft,
  isPending,
  onConfirm,
  onCancel,
}: {
  issue: IssueRecord;
  lines: LineRow[];
  grandTotal: number;
  isDraft: boolean;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl ambient-shadow"
      style={{ backgroundColor: "var(--md-surface-lowest)" }}
    >
      <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: identity */}
        <div className="space-y-4">
          <div>
            <p
              className="mb-1 text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              Mã phiếu xuất
            </p>
            <h1
              className="font-mono text-2xl font-black tracking-tight"
              style={{ color: "var(--md-primary)" }}
            >
              {issue.issue_number}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={issue.status}
              label={
                issue.status === "confirmed"
                  ? "Đã xuất kho"
                  : issue.status === "cancelled"
                    ? "Đã hủy"
                    : "Nháp"
              }
            />
            <StatusBadge
              status={issue.issue_type}
              label={TYPE_LABEL[issue.issue_type] ?? issue.issue_type}
            />
          </div>

          <div
            className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            <span className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0" />
              {new Date(issue.issued_at).toLocaleString("vi-VN")}
            </span>
            {issue.branches?.name && (
              <span className="flex items-center gap-2">
                <Building2 className="size-4 shrink-0" />
                {issue.branches.name}
              </span>
            )}
            {issue.notes && (
              <span className="flex items-center gap-2">
                <FileText className="size-4 shrink-0" />
                {issue.notes}
              </span>
            )}
          </div>
        </div>

        {/* Right: total + stepper */}
        <div className="flex flex-col items-start gap-4 sm:items-end">
          <StatusStepper status={issue.status} />
          {lines.length > 0 && (
            <div className="text-right">
              <p
                className="text-xs"
                style={{ color: "var(--md-on-surface-variant)" }}
              >
                Tổng giá trị xuất
              </p>
              <p className="font-mono text-xl font-bold tabular-nums">
                {grandTotal.toLocaleString("vi-VN")}
                <span
                  className="ml-1 text-sm font-normal"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  ₫
                </span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Action bar — draft only */}
      {isDraft && (
        <div
          className="flex flex-wrap items-center justify-between gap-4 border-t px-6 py-4"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 15%, transparent)",
          }}
        >
          <p
            className="text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            {lines.length === 0
              ? "Thêm ít nhất một dòng trước khi xác nhận."
              : `${lines.length} dòng — xác nhận để trừ tồn kho.`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all"
              style={{
                backgroundColor: "var(--md-surface-high)",
                color: "var(--md-on-surface-variant)",
              }}
              onClick={onCancel}
              disabled={isPending}
            >
              Hủy phiếu
            </button>
            <button
              type="button"
              className="rounded-full px-6 py-2.5 text-sm font-bold text-white transition-all hover:scale-[0.98] disabled:opacity-50"
              style={{
                background:
                  "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
                boxShadow: "0 4px 14px rgba(211,84,0,0.2)",
              }}
              onClick={onConfirm}
              disabled={isPending || lines.length === 0}
            >
              {isPending ? "Đang xử lý..." : "Xác nhận xuất kho"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─── StatusStepper ─── */

function StatusStepper({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2">
        <XCircle className="size-4 text-destructive" />
        <span className="text-sm font-medium text-destructive">Đã hủy</span>
      </div>
    );
  }

  const currentIdx = STATUS_STEPS.findIndex((s) => s.key === status);

  return (
    <div className="flex items-center gap-0">
      {STATUS_STEPS.map((step, idx) => {
        const isDone = idx < currentIdx;
        const isCurrent = idx === currentIdx;

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                  isDone
                    ? "border-success bg-success text-white"
                    : isCurrent
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground",
                )}
              >
                {isDone ? (
                  <CheckCircle2 className="size-4" />
                ) : isCurrent ? (
                  <CircleDot className="size-3.5" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap",
                  isCurrent
                    ? "text-primary"
                    : isDone
                      ? "text-success"
                      : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-2 mb-5 h-0.5 w-12",
                  idx < currentIdx ? "bg-success" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── IssueLineItemsTable ─── */

function IssueLineItemsTable({
  lines,
  isDraft,
  isPending,
  isMobile,
  onDeleteLine,
}: {
  lines: LineRow[];
  isDraft: boolean;
  isPending: boolean;
  isMobile: boolean;
  onDeleteLine: (id: number) => void;
}) {
  const grandTotal = lines.reduce((sum, l) => sum + l.total_cost, 0);

  if (isMobile) {
    return (
      <div
        className="overflow-hidden rounded-2xl ambient-shadow"
        style={{
          backgroundColor: "var(--md-surface-lowest)",
          border:
            "1px solid color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
        }}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <h2
            className="text-sm font-bold"
            style={{ color: "var(--md-on-surface)" }}
          >
            Chi tiết hàng hóa xuất
          </h2>
          <span
            className="text-xs"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            {lines.length} dòng
          </span>
        </div>
        <div className="divide-y">
          {lines.length === 0 ? (
            <div
              className="py-12 text-center"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              <LogOut className="mx-auto mb-2 size-8 opacity-30" />
              <p className="text-sm">
                {isDraft
                  ? "Thêm ít nhất một dòng bên dưới."
                  : "Không có dòng chi tiết."}
              </p>
            </div>
          ) : (
            lines.map((l) => (
              <div
                key={l.id}
                className="p-3 space-y-1.5"
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span
                      className="font-medium text-sm"
                      style={{ color: "var(--md-on-surface)" }}
                    >
                      {l.ingredients?.name ?? `#${l.ingredient_id}`}
                    </span>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "var(--md-on-surface-variant)" }}
                    >
                      {l.quantity.toLocaleString("vi-VN")} {l.unit} ×{" "}
                      {l.unit_cost.toLocaleString("vi-VN")} ₫
                    </p>
                    {l.reason && (
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: "var(--md-on-surface-variant)" }}
                      >
                        {l.reason}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="font-mono text-sm font-semibold">
                      {l.total_cost.toLocaleString("vi-VN")} ₫
                    </span>
                    {isDraft && (
                      <button
                        type="button"
                        className="size-7 flex items-center justify-center rounded text-destructive hover:bg-destructive/10"
                        disabled={isPending}
                        onClick={() => onDeleteLine(l.id)}
                        aria-label="Xóa dòng"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          {lines.length > 0 && (
            <div
              className="flex items-center justify-between px-4 py-3 font-semibold"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
              }}
            >
              <span className="text-sm">Tổng cộng</span>
              <span className="font-mono tabular-nums">
                {grandTotal.toLocaleString("vi-VN")} ₫
              </span>
            </div>
          )}
        </div>
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
      <div
        className="flex items-center justify-between border-b px-6 py-4"
        style={{
          borderColor:
            "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
        }}
      >
        <h2
          className="text-sm font-bold"
          style={{ color: "var(--md-on-surface)" }}
        >
          Chi tiết hàng hóa xuất
        </h2>
        <span
          className="text-xs"
          style={{ color: "var(--md-on-surface-variant)" }}
        >
          {lines.length} dòng
        </span>
      </div>
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
              className="px-6 py-5 text-right text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              Số lượng
            </TableHead>
            <TableHead
              className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              ĐVT
            </TableHead>
            <TableHead
              className="px-6 py-5 text-right text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              Đơn giá
            </TableHead>
            <TableHead
              className="px-6 py-5 text-right text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              Thành tiền
            </TableHead>
            <TableHead
              className="hidden sm:table-cell px-6 py-5 text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              Lý do
            </TableHead>
            {isDraft && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={isDraft ? 7 : 6}
                className="py-12 text-center"
                style={{ color: "var(--md-on-surface-variant)" }}
              >
                <LogOut className="mx-auto mb-2 size-8 opacity-30" />
                <p className="text-sm">
                  {isDraft
                    ? "Thêm ít nhất một dòng bên dưới."
                    : "Không có dòng chi tiết."}
                </p>
              </TableCell>
            </TableRow>
          )}
          {lines.map((l) => (
            <TableRow
              key={l.id}
              className="group transition-colors"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
              }}
            >
              <TableCell className="px-6 py-4 font-medium">
                {l.ingredients?.name ?? `#${l.ingredient_id}`}
              </TableCell>
              <TableCell className="px-6 py-4 text-right font-mono tabular-nums font-semibold">
                {l.quantity.toLocaleString("vi-VN")}
              </TableCell>
              <TableCell
                className="px-6 py-4"
                style={{ color: "var(--md-on-surface-variant)" }}
              >
                {l.unit}
              </TableCell>
              <TableCell
                className="px-6 py-4 text-right font-mono tabular-nums"
                style={{ color: "var(--md-on-surface-variant)" }}
              >
                {l.unit_cost.toLocaleString("vi-VN")} ₫
              </TableCell>
              <TableCell className="px-6 py-4 text-right font-mono font-semibold tabular-nums">
                {l.total_cost.toLocaleString("vi-VN")} ₫
              </TableCell>
              <TableCell
                className="hidden sm:table-cell px-6 py-4 text-sm"
                style={{ color: "var(--md-on-surface-variant)" }}
              >
                {l.reason ?? "—"}
              </TableCell>
              {isDraft && (
                <TableCell className="px-6 py-4 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={isPending}
                    onClick={() => onDeleteLine(l.id)}
                    aria-label="Xóa dòng"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
        {lines.length > 0 && (
          <TableFooter>
            <TableRow
              className="font-semibold"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
                borderColor:
                  "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
              }}
            >
              <TableCell
                colSpan={isDraft ? 4 : 4}
                className="px-6 text-right text-sm"
              >
                Tổng cộng
              </TableCell>
              <TableCell
                className="px-6 text-right font-mono text-base tabular-nums"
                style={{ color: "var(--md-primary)" }}
              >
                {grandTotal.toLocaleString("vi-VN")} ₫
              </TableCell>
              <TableCell className="hidden sm:table-cell" />
              {isDraft && <TableCell />}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </section>
  );
}

/* ─── AddIssueLineForm ─── */

function AddIssueLineForm({
  issueId,
  ingredients,
  isPending,
  onSaved,
  startTransition,
}: {
  issueId: number;
  ingredients: IngredientRow[];
  isPending: boolean;
  onSaved: () => Promise<void>;
  startTransition: React.TransitionStartFunction;
}) {
  const [ingredientId, setIngredientId] = useState("");
  const [reason, setReason] = useState("");
  const [unitCostOverride, setUnitCostOverride] = useState("");

  const selectedIngredient = ingredientId
    ? ingredients.find((i) => i.id === Number(ingredientId))
    : null;

  // Auto-fill cost from ingredient master
  const autoFilledCost = selectedIngredient?.unit_cost ?? 0;

  function handleIngredientChange(val: string) {
    setIngredientId(val);
    // Reset cost override when changing ingredient
    setUnitCostOverride("");
  }

  function addLine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const iid = Number(ingredientId);
    if (!iid) {
      toast.error("Chọn nguyên liệu");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const ing = ingredients.find((x) => x.id === iid);
    const unit = String(fd.get("unit") ?? ing?.unit ?? "");
    const qty = Number(fd.get("qty"));

    // Use override if provided, otherwise auto-filled cost
    const costStr = unitCostOverride.trim();
    const unitCost = costStr ? Number(costStr) : autoFilledCost;

    if (
      !unit ||
      !Number.isFinite(qty) ||
      qty <= 0 ||
      !Number.isFinite(unitCost) ||
      unitCost < 0
    ) {
      toast.error("Kiểm tra số lượng, đơn vị và đơn giá");
      return;
    }

    if (!reason.trim()) {
      toast.error("Vui lòng nhập lý do xuất (bắt buộc)");
      return;
    }

    startTransition(async () => {
      const res = await upsertStockIssueLine({
        issueId,
        ingredientId: iid,
        quantity: qty,
        unit,
        unitCost,
        reason: reason.trim(),
      });
      if (!res.success) {
        toast.error(res.error ?? "Không lưu được dòng");
        return;
      }
      toast.success("Đã lưu dòng");
      setIngredientId("");
      setReason("");
      setUnitCostOverride("");
      await onSaved();
    });
  }

  return (
    <section
      className="overflow-hidden rounded-2xl ambient-shadow"
      style={{
        backgroundColor: "var(--md-surface-lowest)",
        border:
          "1px solid color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
      }}
    >
      <div
        className="border-b px-6 py-4"
        style={{
          borderColor:
            "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
        }}
      >
        <h2
          className="text-sm font-bold"
          style={{ color: "var(--md-on-surface)" }}
        >
          Thêm / cập nhật dòng hàng
        </h2>
      </div>
      <form onSubmit={addLine} className="p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nguyên liệu *</Label>
            <IngredientCombobox
              ingredients={ingredients}
              value={ingredientId}
              onValueChange={handleIngredientChange}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qty">Số lượng xuất *</Label>
            <Input
              id="qty"
              name="qty"
              type="number"
              step="any"
              min="0.001"
              placeholder="0"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="unit">Đơn vị *</Label>
            <Input
              key={`unit-${ingredientId}`}
              id="unit"
              name="unit"
              defaultValue={selectedIngredient?.unit ?? ""}
              placeholder="kg"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="unitCost">
              Đơn giá (₫)
              {selectedIngredient?.unit_cost != null && !unitCostOverride && (
                <span
                  className="ml-1 text-xs font-normal"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  — tự động: {autoFilledCost.toLocaleString("vi-VN")} ₫
                </span>
              )}
            </Label>
            <Input
              id="unitCost"
              type="number"
              step="any"
              min="0"
              placeholder={
                autoFilledCost > 0
                  ? `${autoFilledCost.toLocaleString("vi-VN")} (tự động)`
                  : "0"
              }
              value={unitCostOverride}
              onChange={(e) => setUnitCostOverride(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason">Lý do xuất *</Label>
            <Input
              id="reason"
              placeholder="vd: Chế biến cơm tấm..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            className="rounded-full px-6 py-2.5 text-sm font-bold text-white transition-all hover:scale-[0.98] disabled:opacity-50"
            style={{
              background:
                "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
              boxShadow: "0 4px 14px rgba(211,84,0,0.2)",
            }}
            disabled={isPending || !ingredientId}
          >
            {isPending ? "Đang lưu..." : "Lưu dòng"}
          </button>
          <p
            className="text-xs"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Nếu nguyên liệu đã có, số lượng sẽ được cập nhật.
          </p>
        </div>
      </form>
    </section>
  );
}
