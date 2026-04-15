"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, PlusCircle, Trash2, X } from "lucide-react";
import { cn } from "@comtammatu/ui";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { SectionCard } from "@/components/foundation/ui-patterns";
import { PageHeader, StatusBadge } from "../../_components/shared";
import { EmptyStatePanel } from "../../_components/empty-state-panel";
import { TableEmptyStateRow } from "../../_components/table-empty-state-row";
import { tRoute, tTerm } from "../../_lib/dictionary";
import { formatDateTime, formatQty, formatVND } from "../../_lib/format";
import {
  cancelStockIssue,
  confirmStockIssue,
  deleteStockIssueLine,
  fetchStockIssueDetail,
  upsertStockIssueLine,
} from "../../issue-actions";
import type { IngredientRow } from "../../page";

type IssueRecord = {
  id: number;
  issue_number: string;
  issue_type: string;
  status: string;
  notes: string | null;
  issued_at: string;
  branch_id: number;
  branches: { id: number; name: string } | null;
};

type IssueLine = {
  id: number;
  ingredient_id: number;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  reason: string | null;
  ingredients: { id: number; name: string; unit: string } | null;
};

type AddIssueLineDialogProps = {
  ingredients: IngredientRow[];
  isOpen: boolean;
  isPending: boolean;
  issueId: number;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
  startTransition: React.TransitionStartFunction;
};

export function IssueDetailClient({
  issueId,
  initialIssue,
  initialLines,
  ingredients,
}: {
  issueId: number;
  initialIssue: IssueRecord;
  initialLines: IssueLine[];
  ingredients: IngredientRow[];
}) {
  const router = useRouter();
  const panelClassName = "rounded-lg border bg-card shadow-sm";
  const [issue, setIssue] = useState(initialIssue);
  const [lines, setLines] = useState(initialLines);
  const [isPending, startTransition] = useTransition();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmIssueOpen, setConfirmIssueOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const isDraft = issue.status === "draft";

  const totalAmount = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.total_cost ?? 0), 0),
    [lines],
  );

  async function reload() {
    const res = await fetchStockIssueDetail(issueId);
    if (!res.success || !res.data) {
      toast.error("Không thể tải lại phiếu xuất.");
      return;
    }

    const data = res.data as { issue: IssueRecord; lines: IssueLine[] };
    setIssue(data.issue);
    setLines(data.lines);
    router.refresh();
  }

  function handleDeleteLine() {
    if (pendingDeleteId == null) return;

    startTransition(async () => {
      const res = await deleteStockIssueLine({
        issueId,
        itemId: pendingDeleteId,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không thể xóa dòng khỏi phiếu.");
        return;
      }

      toast.success("Đã xóa dòng nguyên liệu.");
      setPendingDeleteId(null);
      await reload();
    });
  }

  function handleConfirmIssue() {
    startTransition(async () => {
      const res = await confirmStockIssue(issueId);
      if (!res.success) {
        toast.error(res.error ?? "Không thể xác nhận phiếu xuất.");
        return;
      }

      toast.success("Đã xác nhận xuất kho và trừ tồn.");
      setConfirmIssueOpen(false);
      await reload();
    });
  }

  function handleCancelIssue() {
    startTransition(async () => {
      const res = await cancelStockIssue(issueId);
      if (!res.success) {
        toast.error(res.error ?? "Không thể hủy phiếu xuất.");
        return;
      }

      toast.success("Đã hủy phiếu xuất.");
      setConfirmCancelOpen(false);
      await reload();
    });
  }

  return (
    <>
      <div className="space-y-6">
        <Link
          href="/inventory/issues"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-4" /> {tRoute("/inventory/issues")}
        </Link>

        <PageHeader
          eyebrow="Phiếu xuất"
          title={issue.issue_number}
          description={`${issue.branches?.name ?? `Chi nhánh #${issue.branch_id}`} • ${issue.issued_at ? formatDateTime(issue.issued_at) : "—"}`}
          actions={<StatusBadge status={issue.status} />}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Loại phiếu",
              value: issue.issue_type,
            },
            {
              label: "Chi nhánh",
              value: issue.branches?.name ?? `Chi nhánh #${issue.branch_id}`,
            },
            {
              label: "Tổng số dòng",
              value: String(lines.length).padStart(2, "0"),
            },
            {
              label: "Tổng giá trị",
              value: `${formatVND(totalAmount)}đ`,
            },
          ].map((item) => (
            <div
              key={item.label}
              className={cn(panelClassName, "rounded-lg bg-card p-4")}
            >
              <p className="text-label uppercase tracking-wider text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-1 text-sm font-semibold">{item.value}</p>
            </div>
          ))}
        </div>

        {issue.notes ? (
          <SectionCard
            className="rounded-lg border border-border bg-card"
            density="compact"
          >
            <p className="text-label font-medium uppercase tracking-wider text-muted-foreground">
              Ghi chú phiếu xuất
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{issue.notes}</p>
          </SectionCard>
        ) : null}

        <section
          className={cn(panelClassName, "overflow-hidden rounded-lg bg-card")}
        >
          <div className="flex flex-col gap-4 border-b border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <h4 className="text-lg font-bold">{tTerm("ingredientsList")}</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {isDraft
                  ? "Phiếu nháp tự lưu khi thêm hoặc xóa dòng."
                  : "Phiếu đã chốt, dữ liệu chỉ còn ở chế độ xem."}
              </p>
            </div>
            {isDraft ? (
              <Button
                onClick={() => setAddDialogOpen(true)}
                className="bg-success/10 text-success hover:bg-success/15 hover:text-success"
              >
                <PlusCircle className="size-4" />
                Thêm {tTerm("ingredient", "button").toLowerCase()}
              </Button>
            ) : null}
          </div>

          {lines.length === 0 ? (
            <div className="px-6 py-10">
              <EmptyStatePanel
                title={
                  isDraft
                    ? "Chưa có dòng nguyên liệu"
                    : "Phiếu xuất không có dòng nguyên liệu"
                }
                description={
                  isDraft
                    ? "Thêm ít nhất một dòng để xác nhận xuất kho."
                    : "Danh sách nguyên liệu sẽ hiển thị ở đây nếu phiếu có dữ liệu."
                }
              />
            </div>
          ) : (
            <>
              <div className="space-y-3 p-4 md:hidden">
                {lines.map((line) => (
                  <div
                    key={line.id}
                    className="rounded-lg border border-border bg-muted/20 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">
                          {line.ingredients?.name ?? `#${line.ingredient_id}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ID: {line.ingredient_id}
                        </p>
                      </div>
                      {isDraft ? (
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(line.id)}
                          disabled={isPending}
                          className="focus-ring-standard rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-60"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Số lượng</p>
                        <p className="font-semibold">
                          {formatQty(Number(line.quantity ?? 0))}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Đơn vị</p>
                        <p className="font-semibold">
                          {line.unit ?? line.ingredients?.unit ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Đơn giá (WAC)</p>
                        <p className="font-semibold">
                          {formatVND(Number(line.unit_cost ?? 0))}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Thành tiền</p>
                        <p className="font-semibold text-primary">
                          {formatVND(Number(line.total_cost ?? 0))}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 rounded-xl bg-background px-3 py-2 text-sm">
                      <p className="text-muted-foreground">
                        {tTerm("issueReason")}
                      </p>
                      <p className="mt-1">{line.reason ?? "—"}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      {[
                        { label: tTerm("ingredient"), align: "" },
                        { label: "Số lượng", align: "text-right" },
                        { label: "Đơn vị", align: "" },
                        { label: "Đơn giá (WAC)", align: "text-right" },
                        { label: "Thành tiền", align: "text-right" },
                        { label: tTerm("issueReason"), align: "" },
                        { label: "", align: "text-center" },
                      ].map((header) => (
                        <TableHead
                          key={header.label || "delete"}
                          className={`px-6 py-4 whitespace-nowrap text-label font-bold uppercase tracking-wider ${header.align}`}
                        >
                          {header.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.length === 0 && (
                      <TableEmptyStateRow
                        colSpan={7}
                        title="Phiếu xuất chưa có dữ liệu"
                        description="Danh sách nguyên liệu sẽ hiển thị tại đây khi phiếu có dòng hàng."
                      />
                    )}
                    {lines.map((line) => (
                      <TableRow key={line.id} className="transition-colors">
                        <TableCell className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-bold">
                              {line.ingredients?.name ??
                                `#${line.ingredient_id}`}
                            </span>
                            <span className="text-label text-muted-foreground">
                              ID: {line.ingredient_id}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right font-semibold">
                          {formatQty(Number(line.quantity ?? 0))}
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <span className="rounded bg-muted px-2 py-1 text-xs font-medium">
                            {line.unit ?? line.ingredients?.unit ?? ""}
                          </span>
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right font-medium">
                          {formatVND(Number(line.unit_cost ?? 0))}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right font-bold">
                          {formatVND(Number(line.total_cost ?? 0))}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                          {line.reason ?? "—"}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-center">
                          {isDraft ? (
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(line.id)}
                              disabled={isPending}
                              className="focus-ring-standard rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-60"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          <div className="flex justify-end bg-muted/30 p-5 sm:p-6 lg:p-8">
            <div className="w-full max-w-sm space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tổng số dòng:</span>
                <span className="font-bold">
                  {String(lines.length).padStart(2, "0")}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Cộng tiền hàng:</span>
                <span className="font-bold">{formatVND(totalAmount)}</span>
              </div>
              <div className="flex items-end justify-between border-t border-border pt-3">
                <span className="text-sm font-bold">TỔNG CỘNG</span>
                <div className="text-right">
                  <span className="block text-2xl font-black leading-none text-primary">
                    {formatVND(totalAmount)}
                  </span>
                  <span className="text-label font-semibold text-muted-foreground">
                    VNĐ
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {isDraft ? (
          <footer className="flex flex-col gap-4 border-t border-border py-6 md:flex-row md:items-center md:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmCancelOpen(true)}
              className="text-destructive hover:bg-destructive/8 hover:text-destructive disabled:opacity-60"
              disabled={isPending}
            >
              <X className="size-5" />
              Hủy phiếu
            </Button>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <Button type="button" variant="secondary" disabled>
                Nháp tự lưu
              </Button>
              <Button
                type="button"
                onClick={() => setConfirmIssueOpen(true)}
                disabled={isPending || lines.length === 0}
                className="shadow-lg transition-all hover:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CheckCircle className="size-5" />
                Xác nhận xuất kho
              </Button>
            </div>
          </footer>
        ) : null}
      </div>

      <AddIssueLineDialog
        ingredients={ingredients}
        isOpen={addDialogOpen}
        isPending={isPending}
        issueId={issueId}
        onOpenChange={setAddDialogOpen}
        onSaved={reload}
        startTransition={startTransition}
      />

      <AlertDialog open={confirmIssueOpen} onOpenChange={setConfirmIssueOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xuất kho?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Thao tác này sẽ trừ tồn kho và không thể hoàn tác.</p>
                {lines.length > 0 ? (
                  <SectionCard
                    className="rounded-lg bg-muted/30 text-left"
                    density="compact"
                  >
                    {lines.map((line) => (
                      <p key={line.id}>
                        Sẽ trừ{" "}
                        <strong>
                          {formatQty(Number(line.quantity ?? 0))} {line.unit}
                        </strong>{" "}
                        <strong>
                          {line.ingredients?.name ?? `#${line.ingredient_id}`}
                        </strong>{" "}
                        khỏi kho <strong>{issue.branches?.name ?? "—"}</strong>.
                      </p>
                    ))}
                  </SectionCard>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Quay lại</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmIssue}
              disabled={isPending}
            >
              {isPending ? "Đang xử lý..." : "Xác nhận xuất kho"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hủy phiếu xuất?</AlertDialogTitle>
            <AlertDialogDescription>
              Phiếu xuất sẽ chuyển sang trạng thái hủy và không thể xác nhận
              nữa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Không hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelIssue}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? "Đang xử lý..." : "Xác nhận hủy"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa dòng nguyên liệu?</AlertDialogTitle>
            <AlertDialogDescription>
              Dòng này sẽ bị xóa khỏi phiếu xuất nháp.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Quay lại</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteLine}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? "Đang xử lý..." : "Xóa dòng"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AddIssueLineDialog({
  ingredients,
  isOpen,
  isPending,
  issueId,
  onOpenChange,
  onSaved,
  startTransition,
}: AddIssueLineDialogProps) {
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [unitCostOverride, setUnitCostOverride] = useState("");
  const [reason, setReason] = useState("");

  const selectedIngredient = useMemo(
    () =>
      ingredients.find((ingredient) => ingredient.id === Number(ingredientId)),
    [ingredientId, ingredients],
  );
  const autoFilledCost = selectedIngredient?.unit_cost ?? 0;

  function resetForm() {
    setIngredientId("");
    setQuantity("");
    setUnit("");
    setUnitCostOverride("");
    setReason("");
  }

  function handleIngredientChange(value: string) {
    setIngredientId(value);
    const ingredient = ingredients.find((item) => item.id === Number(value));
    setUnit(ingredient?.unit ?? "");
    setUnitCostOverride("");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const parsedIngredientId = Number(ingredientId);
    const parsedQuantity = Number(quantity);
    const parsedUnitCost =
      unitCostOverride.trim().length > 0
        ? Number(unitCostOverride)
        : autoFilledCost;

    if (!parsedIngredientId) {
      toast.error("Chọn nguyên liệu cần xuất.");
      return;
    }

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      toast.error("Số lượng xuất phải lớn hơn 0.");
      return;
    }

    if (!unit.trim()) {
      toast.error("Đơn vị không được để trống.");
      return;
    }

    if (!Number.isFinite(parsedUnitCost) || parsedUnitCost < 0) {
      toast.error("Đơn giá không hợp lệ.");
      return;
    }

    if (!reason.trim()) {
      toast.error("Lý do xuất là bắt buộc để lưu vết.");
      return;
    }

    startTransition(async () => {
      const res = await upsertStockIssueLine({
        issueId,
        ingredientId: parsedIngredientId,
        quantity: parsedQuantity,
        unit: unit.trim(),
        unitCost: parsedUnitCost,
        reason: reason.trim(),
      });

      if (!res.success) {
        toast.error(res.error ?? "Không thể lưu dòng nguyên liệu.");
        return;
      }

      toast.success("Đã lưu dòng nguyên liệu.");
      onOpenChange(false);
      resetForm();
      await onSaved();
    });
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) resetForm();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm dòng nguyên liệu</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nguyên liệu *</Label>
            <Select value={ingredientId} onValueChange={handleIngredientChange}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn nguyên liệu" />
              </SelectTrigger>
              <SelectContent>
                {ingredients
                  .filter((ingredient) => ingredient.is_active)
                  .map((ingredient) => (
                    <SelectItem
                      key={ingredient.id}
                      value={String(ingredient.id)}
                    >
                      {ingredient.name} ({ingredient.unit})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="issue-line-qty">Số lượng xuất *</Label>
              <Input
                id="issue-line-qty"
                type="number"
                step="any"
                min="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="issue-line-unit">Đơn vị *</Label>
              <Input
                id="issue-line-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="kg"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="issue-line-cost">
              Đơn giá (VNĐ)
              {selectedIngredient?.unit_cost != null &&
              unitCostOverride.trim().length === 0 ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  mặc định {formatVND(autoFilledCost)}
                </span>
              ) : null}
            </Label>
            <Input
              id="issue-line-cost"
              type="number"
              step="any"
              min="0"
              value={unitCostOverride}
              onChange={(e) => setUnitCostOverride(e.target.value)}
              placeholder={autoFilledCost > 0 ? formatVND(autoFilledCost) : "0"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="issue-line-reason">Lý do xuất *</Label>
            <Input
              id="issue-line-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ví dụ: cấp phát cho bếp chuẩn bị ca chiều"
            />
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="focus-ring-standard rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="focus-ring-standard rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {isPending ? "Đang lưu..." : "Lưu dòng"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
