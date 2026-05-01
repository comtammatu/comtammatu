"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  CircleCheck as IconCircleCheck,
  CirclePlus as IconCirclePlus,
  Trash as IconTrash,
  X as IconX,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Combobox } from "@/components/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { InventoryHeader } from "../../_components/inventory-header";
import { FormattedNumberInput } from "../../_components/formatted-number-input";
import { TableEmptyStateRow } from "../../_components/table-empty-state-row";
import { DocumentStockCorrectionDialog } from "../../_components/document-stock-correction-dialog";
import { tRoute, tTerm } from "../../_lib/dictionary";
import { formatDateTime, formatQty, formatVND } from "../../_lib/format";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../../_lib/ui";
import {
  cancelStockIssue,
  confirmStockIssue,
  deleteStockIssueLine,
  fetchStockIssueDetail,
  upsertStockIssueLine,
} from "../../issue-actions";
import type { IngredientRow } from "../../page";

import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
type IssueRecord = {
  id: number;
  issue_number: string;
  issue_type: string;
  status: string;
  notes: string | null;
  issued_at: string;
  branch_id: number;
  branches: { id: number; name: string; branch_kind?: string | null } | null;
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

function getWarehouseUnit(ingredient: IngredientRow) {
  return ingredient.purchase_unit || ingredient.unit;
}

// kitchen_use retired 2026-04-25 (replaced by intra-branch stock_transfer).
// Label for consumption flips by branch_kind:
//   central_warehouse / central_kitchen → "Hao hụt kho"
//   branch                              → "Tiêu hao"
function getIssueSurface(
  issueType: string,
  branchKind: string | null | undefined,
) {
  const isStorage =
    branchKind === "central_warehouse" || branchKind === "central_kitchen";

  if (issueType === "consumption" && isStorage) {
    return {
      eyebrow: "Hao hụt kho",
      label: "Phiếu hao hụt",
      confirmTitle: "Xác nhận hao hụt kho?",
      confirmAction: "Xác nhận hao hụt",
      noteLabel: "Ghi chú phiếu hao hụt",
    };
  }

  if (issueType === "writeoff") {
    return {
      eyebrow: "Hủy hỏng",
      label: "Phiếu hủy hỏng",
      confirmTitle: "Xác nhận hủy hỏng?",
      confirmAction: "Xác nhận hủy hỏng",
      noteLabel: "Ghi chú phiếu hủy hỏng",
    };
  }

  return {
    eyebrow: "Xuất kho",
    label: "Phiếu xuất",
    confirmTitle: "Xác nhận xuất kho?",
    confirmAction: "Xác nhận xuất kho",
    noteLabel: "Ghi chú phiếu xuất",
  };
}

export function IssueDetailClient({
  issueId,
  initialIssue,
  initialLines,
  ingredients,
  canAdjustStock,
}: {
  issueId: number;
  initialIssue: IssueRecord;
  initialLines: IssueLine[];
  ingredients: IngredientRow[];
  canAdjustStock: boolean;
}) {
  const router = useRouter();
  const [issue, setIssue] = useState(initialIssue);
  const [lines, setLines] = useState(initialLines);
  const [isPending, startTransition] = useTransition();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmIssueOpen, setConfirmIssueOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const isDraft = issue.status === "draft";
  const surface = getIssueSurface(
    issue.issue_type,
    issue.branches?.branch_kind ?? null,
  );

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
      <InventoryHeader
        title="Chi tiết xuất kho"
        actions={
          <Link
            href="/inventory/issues"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <IconArrowLeft className="size-4" /> {tRoute("/inventory/issues")}
          </Link>
        }
      />
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                {surface.eyebrow}
              </p>
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {issue.issue_number}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {`${surface.label} tai ${issue.branches?.name ?? `Chi nhanh #${issue.branch_id}`} • ${issue.issued_at ? formatDateTime(issue.issued_at) : "—"}`}
                </p>
              </div>
            </div>
            <Badge variant={getInventoryStatusBadgeVariant(issue.status)}>
              {getInventoryStatusLabel(issue.status)}
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Nghiep vu",
                value: surface.label,
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
              <Card key={item.label}>
                <CardContent>
                  <Badge variant="secondary">{item.label}</Badge>
                  <p className="mt-3 text-xl font-semibold text-foreground">
                    {item.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {issue.notes ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {surface.noteLabel}
                </p>
                <p className="mt-1 line-clamp-3 break-words text-sm text-muted-foreground">
                  {issue.notes}
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card className="overflow-hidden">
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle>{tTerm("ingredientsList")}</CardTitle>
                <p className="text-sm text-muted-foreground">
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
                  <IconCirclePlus className="size-4" />
                  Thêm {tTerm("ingredient", "button").toLowerCase()}
                </Button>
              ) : canAdjustStock && lines.length > 0 ? (
                <DocumentStockCorrectionDialog
                  documentType="issue"
                  documentId={issue.id}
                  documentCode={issue.issue_number}
                  branchOptions={[
                    {
                      id: issue.branch_id,
                      name:
                        issue.branches?.name ?? `Chi nhánh #${issue.branch_id}`,
                    },
                  ]}
                  itemOptions={lines.map((line) => ({
                    ingredientId: line.ingredient_id,
                    name: line.ingredients?.name ?? `#${line.ingredient_id}`,
                    unit: line.unit ?? line.ingredients?.unit ?? "",
                  }))}
                />
              ) : null}
            </CardHeader>
            <CardContent>
              {lines.length === 0 ? (
                <Empty className="m-4 py-8">
                  <EmptyHeader>
                    <EmptyTitle className="text-sm font-semibold">
                      {isDraft
                        ? "Chưa có dòng nguyên liệu"
                        : `${surface.label} khong co dong nguyen lieu`}
                    </EmptyTitle>
                    <EmptyDescription className="text-xs leading-5">
                      {isDraft
                        ? `Them it nhat mot dong de ${surface.confirmAction.toLowerCase()}.`
                        : "Danh sach nguyen lieu se hien thi o day neu phieu co du lieu."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <>
                  <div className="space-y-3 p-4 md:hidden">
                    {lines.map((line) => (
                      <Card key={line.id} className="bg-muted/20">
                        <CardContent>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold">
                                {line.ingredients?.name ??
                                  `#${line.ingredient_id}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                ID: {line.ingredient_id}
                              </p>
                            </div>
                            {isDraft ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setPendingDeleteId(line.id)}
                                disabled={isPending}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <IconTrash className="size-4" />
                              </Button>
                            ) : null}
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-muted-foreground">{FORM_VI.quantity}</p>
                              <p className="font-semibold">
                                {formatQty(Number(line.quantity ?? 0))}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">{FORM_VI.unit}</p>
                              <p className="font-semibold">
                                {line.unit ?? line.ingredients?.unit ?? "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                Đơn giá (WAC)
                              </p>
                              <p className="font-semibold">
                                {formatVND(Number(line.unit_cost ?? 0))}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                {FORM_VI.amount}
                              </p>
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
                        </CardContent>
                      </Card>
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
                              className={`px-6 py-4 whitespace-nowrap text-xs font-bold uppercase tracking-wider ${header.align}`}
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
                                <span className="text-xs text-muted-foreground">
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
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setPendingDeleteId(line.id)}
                                  disabled={isPending}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <IconTrash className="size-4" />
                                </Button>
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

              <div className="mt-4 flex justify-end rounded-3xl border border-border/60 bg-muted/30 p-5 sm:p-6 lg:p-8">
                <div className="w-full max-w-sm space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tổng số dòng:</span>
                    <span className="font-bold">
                      {String(lines.length).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Cộng tiền hàng:
                    </span>
                    <span className="font-bold">{formatVND(totalAmount)}</span>
                  </div>
                  <div className="flex items-end justify-between border-t border-border pt-3">
                    <span className="text-sm font-bold">TỔNG CỘNG</span>
                    <div className="text-right">
                      <span className="block text-2xl font-black leading-none text-primary">
                        {formatVND(totalAmount)}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground">
                        VNĐ
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {isDraft ? (
            <footer className="flex flex-col gap-4 border-t border-border py-6 md:flex-row md:items-center md:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmCancelOpen(true)}
                className="text-destructive hover:bg-destructive/8 hover:text-destructive disabled:opacity-60"
                disabled={isPending}
              >
                <IconX className="size-5" />
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
                  <IconCircleCheck className="size-5" />
                  {surface.confirmAction}
                </Button>
              </div>
            </footer>
          ) : null}
        </div>
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
            <AlertDialogTitle>{surface.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Thao tác này sẽ trừ tồn kho và không thể hòan tác.</p>
                {lines.length > 0 ? (
                  <Card className="bg-muted/30 text-left">
                    <CardContent className="space-y-2 pt-6">
                      {lines.map((line) => (
                        <p key={line.id}>
                          Se tru{" "}
                          <strong>
                            {formatQty(Number(line.quantity ?? 0))} {line.unit}
                          </strong>{" "}
                          <strong>
                            {line.ingredients?.name ?? `#${line.ingredient_id}`}
                          </strong>{" "}
                          khoi kho{" "}
                          <strong>{issue.branches?.name ?? "—"}</strong>.
                        </p>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{ACTIONS_VI.back}</AlertDialogCancel>
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
            <AlertDialogCancel>{ACTIONS_VI.back}</AlertDialogCancel>
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
  const [reason, setReason] = useState("");

  function resetForm() {
    setIngredientId("");
    setQuantity("");
    setUnit("");
    setReason("");
  }

  function handleIngredientChange(value: string) {
    setIngredientId(value);
    const ingredient = ingredients.find((item) => item.id === Number(value));
    setUnit(ingredient ? getWarehouseUnit(ingredient) : "");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const parsedIngredientId = Number(ingredientId);
    const parsedQuantity = Number(quantity);

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

    if (!reason.trim()) {
      toast.error("Lý do xuất là bắt buộc để lưu vết.");
      return;
    }

    // Đơn giá (WAC) áp dụng từ stock_levels.avg_unit_cost tại thời điểm
    // confirm phiếu — không cho người dùng nhập tay để tránh lệch giá vốn.
    startTransition(async () => {
      const res = await upsertStockIssueLine({
        issueId,
        ingredientId: parsedIngredientId,
        quantity: parsedQuantity,
        unit: unit.trim(),
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
            <Combobox
              value={ingredientId}
              onValueChange={handleIngredientChange}
              options={ingredients
                .filter((ingredient) => ingredient.is_active)
                .map((ingredient) => ({
                  value: String(ingredient.id),
                  label: ingredient.name,
                  hint: getWarehouseUnit(ingredient),
                  keywords: [ingredient.sku ?? "", ingredient.category ?? ""],
                }))}
              placeholder="Chọn nguyên liệu"
              searchPlaceholder="Tìm tên, SKU, danh mục..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="issue-line-qty">Số lượng xuất *</Label>
              <FormattedNumberInput
                id="issue-line-qty"
                value={quantity}
                onValueChange={setQuantity}
                maxFractionDigits={3}
                placeholder="0"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="issue-line-unit">Đơn vị *</Label>
              <Input
                id="issue-line-unit"
                value={unit}
                readOnly
                aria-readonly="true"
                placeholder="kg"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Đơn giá (WAC) tự áp dụng từ tồn kho tại thời điểm xác nhận phiếu.
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="issue-line-reason">Lý do xuất *</Label>
            <Textarea
              id="issue-line-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ví dụ: cấp phát cho bếp chuẩn bị ca chiều"
              className="min-h-24"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Đang lưu..." : "Lưu dòng"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
