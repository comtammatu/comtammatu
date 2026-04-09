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
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
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
        <Link href="/admin/inventory/issues">
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
    <div className="rounded-lg border bg-card shadow-sm">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: identity */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-bold tracking-tight">
              {issue.issue_number}
            </h1>
            <Badge
              className={cn(
                issue.status === "confirmed"
                  ? "bg-success/10 text-success border-success/30"
                  : issue.status === "cancelled"
                    ? "bg-destructive/10 text-destructive border-destructive/30"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {issue.status === "confirmed"
                ? "Đã xuất kho"
                : issue.status === "cancelled"
                  ? "Đã hủy"
                  : "Nháp"}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {TYPE_LABEL[issue.issue_type] ?? issue.issue_type}
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="size-4 shrink-0" />
              <span>{new Date(issue.issued_at).toLocaleString("vi-VN")}</span>
            </div>
            {issue.branches?.name && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="size-4 shrink-0" />
                <span>{issue.branches.name}</span>
              </div>
            )}
            {issue.notes && (
              <div className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
                <FileText className="size-4 shrink-0" />
                <span>{issue.notes}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: total + stepper */}
        <div className="flex flex-col items-start gap-4 sm:items-end">
          <StatusStepper status={issue.status} />
          {lines.length > 0 && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Tổng giá trị xuất</p>
              <p className="font-mono text-xl font-bold tabular-nums">
                {grandTotal.toLocaleString("vi-VN")}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  ₫
                </span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Action bar — draft only */}
      {isDraft && (
        <div className="flex items-center justify-between gap-4 border-t bg-muted/30 px-5 py-3">
          <p className="text-sm text-muted-foreground">
            {lines.length === 0
              ? "Thêm ít nhất một dòng trước khi xác nhận."
              : `${lines.length} dòng — xác nhận để trừ tồn kho.`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isPending}
            >
              Hủy phiếu
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              disabled={isPending || lines.length === 0}
            >
              {isPending ? "Đang xử lý…" : "Xác nhận xuất kho"}
            </Button>
          </div>
        </div>
      )}
    </div>
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
      <div className="rounded-lg border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
          <h2 className="text-sm font-semibold">Chi tiết hàng hóa xuất</h2>
          <span className="text-xs text-muted-foreground">
            {lines.length} dòng
          </span>
        </div>
        <div className="divide-y">
          {lines.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <LogOut className="mx-auto mb-2 size-8 opacity-30" />
              <p className="text-sm">
                {isDraft
                  ? "Thêm ít nhất một dòng bên dưới."
                  : "Không có dòng chi tiết."}
              </p>
            </div>
          ) : (
            lines.map((l) => (
              <div key={l.id} className="p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-sm">
                      {l.ingredients?.name ?? `#${l.ingredient_id}`}
                    </span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {l.quantity.toLocaleString("vi-VN")} {l.unit} ×{" "}
                      {l.unit_cost.toLocaleString("vi-VN")} ₫
                    </p>
                    {l.reason && (
                      <p className="text-xs text-muted-foreground mt-0.5">
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
            <div className="flex items-center justify-between bg-muted/40 px-3 py-2 font-semibold">
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
    <div className="rounded-lg border shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
        <h2 className="text-sm font-semibold">Chi tiết hàng hóa xuất</h2>
        <span className="text-xs text-muted-foreground">
          {lines.length} dòng
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/20 hover:bg-muted/20">
            <TableHead className="text-xs font-semibold uppercase tracking-wider">
              Nguyên liệu
            </TableHead>
            <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
              Số lượng
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">
              ĐVT
            </TableHead>
            <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
              Đơn giá
            </TableHead>
            <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
              Thành tiền
            </TableHead>
            <TableHead className="hidden sm:table-cell text-xs font-semibold uppercase tracking-wider">
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
                className="py-12 text-center text-muted-foreground"
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
              className="hover:bg-muted/30 transition-colors"
            >
              <TableCell className="font-medium">
                {l.ingredients?.name ?? `#${l.ingredient_id}`}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {l.quantity.toLocaleString("vi-VN")}
              </TableCell>
              <TableCell className="text-muted-foreground">{l.unit}</TableCell>
              <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                {l.unit_cost.toLocaleString("vi-VN")} ₫
              </TableCell>
              <TableCell className="text-right font-mono font-semibold tabular-nums">
                {l.total_cost.toLocaleString("vi-VN")} ₫
              </TableCell>
              <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                {l.reason ?? "—"}
              </TableCell>
              {isDraft && (
                <TableCell className="text-right">
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
            <TableRow className="bg-muted/40 font-semibold">
              <TableCell
                colSpan={isDraft ? 4 : 4}
                className="text-right text-sm"
              >
                Tổng cộng
              </TableCell>
              <TableCell className="text-right font-mono text-base tabular-nums">
                {grandTotal.toLocaleString("vi-VN")} ₫
              </TableCell>
              <TableCell className="hidden sm:table-cell" />
              {isDraft && <TableCell />}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
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
    <div className="rounded-lg border bg-muted/20 shadow-sm">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Thêm / cập nhật dòng hàng</h2>
      </div>
      <form onSubmit={addLine} className="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nguyên liệu *</Label>
            <Select
              value={ingredientId}
              onValueChange={handleIngredientChange}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn nguyên liệu…" />
              </SelectTrigger>
              <SelectContent>
                {ingredients.map((i) => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.name}
                    <span className="ml-1.5 text-muted-foreground">
                      ({i.unit})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                <span className="ml-1 text-xs text-muted-foreground font-normal">
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
              placeholder="vd: Chế biến cơm tấm…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" size="sm" disabled={isPending || !ingredientId}>
            {isPending ? "Đang lưu…" : "Lưu dòng"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Nếu nguyên liệu đã có, số lượng sẽ được cập nhật.
          </p>
        </div>
      </form>
    </div>
  );
}
