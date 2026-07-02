"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing inventory issue detail surface keeps localized JSX copy until message-catalog extraction */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  ArrowLeft as IconArrowLeft,
  CircleCheck as IconCircleCheck,
  CirclePlus as IconCirclePlus,
  Trash as IconTrash,
  X as IconX,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Field, FieldError, FieldLabel } from "@comtammatu/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Combobox,
  FormDialog,
  NumberField,
  TextareaField,
  TextField,
} from "@/components/form";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { toast } from "@comtammatu/ui/components/sonner";
import { KpiCard } from "@/components/kpi/kpi-card";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import { getStatusBadgeMeta } from "@/components/status-badge";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { AuditHistoryList } from "../../_components/audit-history-list";
import type { AuditLogRow } from "@/_lib/audit";
import { DocumentStockCorrectionDialog } from "../../_components/document-stock-correction-dialog";
import { tRoute, tTerm } from "../../_lib/dictionary";
import { formatDateTime, formatQty, formatVND } from "../../_lib/format";
import { messages } from "@lib/messages";
import {
  cancelStockIssue,
  confirmStockIssue,
  deleteStockIssueLine,
  fetchStockIssueDetail,
  upsertStockIssueLine,
} from "../../issue-actions";
import {
  getDefaultIssueUnit,
  getIssueUnitOptions,
} from "../../_lib/issue-units";
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
  source_type: string | null;
  source_ref: unknown;
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
  issueId: number;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
};

const addIssueLineSchema = z.object({
  ingredientId: z.string().min(1, { error: "Chọn nguyên liệu cần xuất." }),
  quantity: z
    .string()
    .min(1, { error: "Nhập số lượng xuất." })
    .refine((value) => Number(value) > 0, {
      error: "Số lượng xuất phải lớn hơn 0.",
    }),
  unit: z.string().trim().min(1, { error: "Đơn vị không được để trống." }),
  // Issue-role unit id (as string) the qty was entered in; "" => free-text unit.
  entryUnitId: z.string().optional(),
  reason: z.string().trim().min(1, {
    error: "Lý do xuất là bắt buộc để lưu vết.",
  }),
});

type AddIssueLineFormValues = z.infer<typeof addIssueLineSchema>;

function getWarehouseUnit(ingredient: IngredientRow) {
  return ingredient.purchase_unit || ingredient.unit;
}

function getIssueSurface(
  issueType: string,
  branchKind: string | null | undefined,
) {
  void branchKind;

  if (issueType === "writeoff") {
    return {
      eyebrow: "Hủy hỏng",
      label: "Phiếu hủy hỏng",
      confirmTitle: "Xác nhận hủy hỏng?",
      confirmAction: "Xác nhận hủy hỏng",
      noteLabel: "Ghi chú phiếu hủy hỏng",
    };
  }

  if (issueType === "consumption") {
    return {
      eyebrow: "Tiêu hao",
      label: "Phiếu tiêu hao",
      confirmTitle: "Xác nhận tiêu hao?",
      confirmAction: "Xác nhận tiêu hao",
      noteLabel: "Ghi chú tiêu hao",
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

function getIssueSourceLabel(issue: IssueRecord) {
  const ref =
    issue.source_ref && typeof issue.source_ref === "object"
      ? (issue.source_ref as { source?: unknown; source_label?: unknown })
      : null;

  if (
    issue.source_type === "hrm_consumption" ||
    ref?.source === "attendance_consumption_report"
  ) {
    return typeof ref?.source_label === "string"
      ? ref.source_label
      : "HRM - Tiêu hao bếp trong ngày";
  }

  return issue.source_type === "manual" || !issue.source_type
    ? "Thủ công"
    : issue.source_type;
}

export function IssueDetailClient({
  issueId,
  initialIssue,
  initialLines,
  ingredients,
  canAdjustStock,
  auditLogs = [],
  listBasePath = "/inventory/consumption",
}: {
  issueId: number;
  initialIssue: IssueRecord;
  initialLines: IssueLine[];
  ingredients: IngredientRow[];
  canAdjustStock: boolean;
  auditLogs?: AuditLogRow[];
  listBasePath?: string;
}) {
  const router = useRouter();
  const [issue, setIssue] = useState(initialIssue);
  const [lines, setLines] = useState(initialLines);
  const [isPending, startTransition] = useTransition();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const isDraft = issue.status === "draft";
  const surface = getIssueSurface(
    issue.issue_type,
    issue.branches?.branch_kind ?? null,
  );
  const statusBadge = getStatusBadgeMeta("inventory", issue.status);

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

  async function handleDeleteLine(itemId: number) {
    const ok = await confirm({
      title: "Xóa dòng nguyên liệu?",
      description: "Dòng này sẽ bị xóa khỏi phiếu xuất nháp.",
      confirmText: "Xóa dòng",
      cancelText: ACTIONS_VI.back,
      variant: "destructive",
    });

    if (!ok) return;

    startTransition(async () => {
      const res = await deleteStockIssueLine({
        issueId,
        itemId,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không thể xóa dòng khỏi phiếu.");
        return;
      }

      toast.success("Đã xóa dòng nguyên liệu.");
      await reload();
    });
  }

  async function handleConfirmIssue() {
    const ok = await confirm({
      title: surface.confirmTitle,
      description: `Thao tác này sẽ trừ tồn kho tại ${issue.branches?.name ?? "—"} và không thể hoàn tác.`,
      details: lines.map((line) => ({
        label: line.ingredients?.name ?? `#${line.ingredient_id}`,
        value: `${formatQty(Number(line.quantity ?? 0))} ${line.unit}`,
      })),
      confirmText: surface.confirmAction,
      cancelText: ACTIONS_VI.back,
    });

    if (!ok) return;

    startTransition(async () => {
      const res = await confirmStockIssue(issueId);
      if (!res.success) {
        toast.error(res.error ?? "Không thể xác nhận phiếu xuất.");
        return;
      }

      toast.success("Đã xác nhận xuất kho và trừ tồn.");
      await reload();
    });
  }

  async function handleCancelIssue() {
    const ok = await confirm({
      title: "Hủy phiếu xuất?",
      description:
        "Phiếu xuất sẽ chuyển sang trạng thái hủy và không thể xác nhận nữa.",
      confirmText: "Xác nhận hủy",
      cancelText: "Không hủy",
      variant: "destructive",
    });

    if (!ok) return;

    startTransition(async () => {
      const res = await cancelStockIssue(issueId);
      if (!res.success) {
        toast.error(res.error ?? "Không thể hủy phiếu xuất.");
        return;
      }

      toast.success("Đã hủy phiếu xuất.");
      await reload();
    });
  }

  const lineColumns: DataTableColumn<IssueLine>[] = [
    {
      key: "ingredient",
      header: tTerm("ingredient"),
      render: (line) => (
        <div className="flex flex-col">
          <span className="font-bold">
            {line.ingredients?.name ?? `#${line.ingredient_id}`}
          </span>
          <span className="text-xs text-muted-foreground">
            ID: {line.ingredient_id}
          </span>
        </div>
      ),
    },
    {
      key: "qty",
      header: "Số lượng",
      className: "text-right font-semibold",
      render: (line) => formatQty(Number(line.quantity ?? 0)),
    },
    {
      key: "unit",
      header: "Đơn vị",
      render: (line) => (
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
          {line.unit ?? line.ingredients?.unit ?? ""}
        </span>
      ),
    },
    {
      key: "unitCost",
      header: "Đơn giá (WAC)",
      className: "text-right font-medium",
      render: (line) => formatVND(Number(line.unit_cost ?? 0)),
    },
    {
      key: "total",
      header: "Thành tiền",
      className: "text-right font-bold",
      render: (line) => formatVND(Number(line.total_cost ?? 0)),
    },
    {
      key: "reason",
      header: tTerm("issueReason"),
      className: "text-sm text-muted-foreground",
      render: (line) => line.reason ?? "—",
    },
    {
      key: "actions",
      header: "",
      className: "text-center",
      render: (line) =>
        isDraft ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleDeleteLine(line.id)}
            disabled={isPending}
            className="text-muted-foreground hover:text-destructive"
          >
            <IconTrash className="size-4" />
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        eyebrow={surface.eyebrow}
        title={issue.issue_number}
        description={`${surface.label} tại ${issue.branches?.name ?? `Chi nhánh #${issue.branch_id}`} • ${issue.issued_at ? formatDateTime(issue.issued_at) : "—"}`}
        badge={{
          children: statusBadge.label,
          variant: statusBadge.variant,
        }}
        breadcrumb={
          <Link
            href={listBasePath}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <IconArrowLeft className="size-4" />{" "}
            {tRoute("/inventory/consumption")}
          </Link>
        }
        tabs={
          <AppPageTabs
            items={[
              { value: "overview", label: "Tổng quan" },
              { value: "lines", label: "Dòng", count: lines.length },
              { value: "history", label: "Lịch sử", count: auditLogs.length },
            ]}
          >
            <TabsContent value="overview">
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  {[
                    {
                      label: "Nghiep vu",
                      value: surface.label,
                    },
                    {
                      label: "Chi nhánh",
                      value:
                        issue.branches?.name ?? `Chi nhánh #${issue.branch_id}`,
                    },
                    {
                      label: "Tổng số dòng",
                      value: String(lines.length).padStart(2, "0"),
                    },
                    {
                      label: "Nguồn",
                      value: getIssueSourceLabel(issue),
                    },
                    {
                      label: "Tổng giá trị",
                      value: formatVND(totalAmount),
                    },
                  ].map((item) => (
                    <KpiCard
                      key={item.label}
                      label={item.label}
                      value={item.value}
                    />
                  ))}
                </div>

                {issue.notes ? (
                  <AppSection title={surface.noteLabel} size="sm">
                    <p className="line-clamp-3 break-words text-sm text-muted-foreground">
                      {issue.notes}
                    </p>
                  </AppSection>
                ) : null}
              </div>
            </TabsContent>

            <TabsContent value="lines">
              <div className="flex flex-col gap-4">
                <AppSection
                  title={tTerm("ingredientsList")}
                  description={
                    isDraft
                      ? "Phiếu nháp tự lưu khi thêm hoặc xóa dòng."
                      : "Phiếu đã chốt, dữ liệu chỉ còn ở chế độ xem."
                  }
                  action={
                    isDraft ? (
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
                              issue.branches?.name ??
                              `Chi nhánh #${issue.branch_id}`,
                          },
                        ]}
                        itemOptions={lines.map((line) => ({
                          ingredientId: line.ingredient_id,
                          name:
                            line.ingredients?.name ?? `#${line.ingredient_id}`,
                          unit: line.unit ?? line.ingredients?.unit ?? "",
                        }))}
                      />
                    ) : null
                  }
                >
                  {lines.length === 0 ? (
                    <AppEmptyState
                      mode="no-data"
                      title={
                        isDraft
                          ? "Chưa có dòng nguyên liệu"
                          : `${surface.label} chưa có dòng nguyên liệu`
                      }
                      description={
                        isDraft
                          ? `Thêm ít nhất một dòng để ${surface.confirmAction.toLowerCase()}.`
                          : "Danh sách nguyên liệu sẽ hiển thị ở đây nếu phiếu có dữ liệu."
                      }
                      compact
                    />
                  ) : (
                    <DataTable
                      columns={lineColumns}
                      data={lines}
                      getRowKey={(line) => line.id}
                      mobileCardRender={(item) => (
                        <IssueLineMobileCard
                          item={item}
                          isDraft={isDraft}
                          isPending={isPending}
                          onDelete={handleDeleteLine}
                        />
                      )}
                    />
                  )}

                  <div className="flex justify-end rounded-md border border-border/60 bg-muted/30 p-4">
                    <div className="flex w-full max-w-sm flex-col gap-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Tổng số dòng:
                        </span>
                        <span className="font-bold">
                          {String(lines.length).padStart(2, "0")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Cộng tiền hàng:
                        </span>
                        <span className="font-bold">
                          {formatVND(totalAmount)}
                        </span>
                      </div>
                      <div className="flex items-end justify-between border-t border-border pt-3">
                        <span className="text-sm font-bold">TỔNG CỘNG</span>
                        <div className="text-right">
                          <span className="block font-mono text-xl font-semibold leading-none tabular-nums text-primary">
                            {messages.inventory.common.currency(
                              formatVND(totalAmount),
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </AppSection>

                {isDraft ? (
                  <footer className="flex flex-col gap-4 border-t border-border py-4 md:flex-row md:items-center md:justify-between">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleCancelIssue}
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
                        onClick={handleConfirmIssue}
                        disabled={isPending || lines.length === 0}
                        className="transition-transform hover:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <IconCircleCheck className="size-5" />
                        {surface.confirmAction}
                      </Button>
                    </div>
                  </footer>
                ) : null}
              </div>
            </TabsContent>

            <TabsContent value="history">
              <AuditHistoryList logs={auditLogs} />
            </TabsContent>
          </AppPageTabs>
        }
      />

      <AddIssueLineDialog
        ingredients={ingredients}
        isOpen={addDialogOpen}
        issueId={issueId}
        onOpenChange={setAddDialogOpen}
        onSaved={reload}
      />
    </AppPage>
  );
}

function AddIssueLineDialog({
  ingredients,
  isOpen,
  issueId,
  onOpenChange,
  onSaved,
}: AddIssueLineDialogProps) {
  const defaultValues = useMemo<AddIssueLineFormValues>(
    () => ({
      ingredientId: "",
      quantity: "",
      unit: "",
      entryUnitId: "",
      reason: "",
    }),
    [],
  );

  async function handleSubmit(values: AddIssueLineFormValues) {
    const res = await upsertStockIssueLine({
      issueId,
      ingredientId: Number(values.ingredientId),
      quantity: Number(values.quantity),
      unit: values.unit.trim(),
      entryUnitId: values.entryUnitId ? Number(values.entryUnitId) : null,
      reason: values.reason.trim(),
    });

    if (!res.success) {
      return {
        success: false,
        error: res.error ?? "Không thể lưu dòng nguyên liệu.",
      };
    }

    await onSaved();
    return { success: true };
  }

  return (
    <FormDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      title="Thêm dòng nguyên liệu"
      schema={addIssueLineSchema}
      defaultValues={defaultValues}
      entityKey={`issue-line-${issueId}`}
      onSubmit={handleSubmit}
      successMessage="Đã lưu dòng nguyên liệu."
      submitLabel="Lưu dòng"
      cancelLabel={ACTIONS_VI.cancel}
    >
      {(form) => {
        const ingredientError = form.formState.errors.ingredientId;
        const selectedIngredient = ingredients.find(
          (item) => item.id === Number(form.watch("ingredientId")),
        );
        const issueUnitOptions = getIssueUnitOptions(selectedIngredient);
        const entryUnitId = form.watch("entryUnitId");
        return (
          <>
            <Field data-invalid={!!ingredientError}>
              <FieldLabel>Nguyên liệu *</FieldLabel>
              <Combobox
                value={form.watch("ingredientId")}
                onValueChange={(value) => {
                  form.setValue("ingredientId", value, {
                    shouldValidate: true,
                  });
                  const ingredient = ingredients.find(
                    (item) => item.id === Number(value),
                  );
                  const defaultUnit = getDefaultIssueUnit(ingredient);
                  form.setValue(
                    "unit",
                    defaultUnit?.code ??
                      (ingredient ? getWarehouseUnit(ingredient) : ""),
                    { shouldValidate: true },
                  );
                  form.setValue(
                    "entryUnitId",
                    defaultUnit ? String(defaultUnit.unitId) : "",
                  );
                }}
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
              {ingredientError ? (
                <FieldError errors={[ingredientError]} />
              ) : null}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                control={form.control}
                name="quantity"
                label="Số lượng xuất"
                maxFractionDigits={3}
                placeholder="0"
                required
              />

              {issueUnitOptions.length > 0 ? (
                <Field>
                  <FieldLabel htmlFor="issue-line-unit">Đơn vị *</FieldLabel>
                  <Select
                    value={entryUnitId ?? ""}
                    onValueChange={(value) => {
                      form.setValue("entryUnitId", value);
                      const opt = issueUnitOptions.find(
                        (o) => String(o.unitId) === value,
                      );
                      if (opt) {
                        form.setValue("unit", opt.code, {
                          shouldValidate: true,
                        });
                      }
                    }}
                  >
                    <SelectTrigger
                      id="issue-line-unit"
                      aria-label={form.watch("unit")}
                    >
                      <SelectValue placeholder="Chọn đơn vị" />
                    </SelectTrigger>
                    <SelectContent>
                      {issueUnitOptions.map((o) => (
                        <SelectItem key={o.unitId} value={String(o.unitId)}>
                          {o.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : (
                <TextField
                  control={form.control}
                  name="unit"
                  label="Đơn vị"
                  readOnly
                  aria-readonly="true"
                  placeholder="kg"
                  required
                />
              )}
            </div>

            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Đơn giá (WAC) tự áp dụng từ tồn kho tại thời điểm xác nhận phiếu.
            </div>

            <TextareaField
              control={form.control}
              name="reason"
              label="Lý do xuất"
              rows={3}
              placeholder="Ví dụ: cấp phát cho bếp chuẩn bị ca chiều"
              required
            />
          </>
        );
      }}
    </FormDialog>
  );
}

function IssueLineMobileCard({
  item,
  isDraft,
  isPending,
  onDelete,
}: {
  item: IssueLine;
  isDraft: boolean;
  isPending: boolean;
  onDelete: (lineId: number) => void;
}) {
  return (
    <Item variant="outline" className="bg-muted/20">
      <ItemHeader>
        <div>
          <ItemTitle>
            {item.ingredients?.name ?? `#${item.ingredient_id}`}
          </ItemTitle>
          <ItemDescription>ID: {item.ingredient_id}</ItemDescription>
        </div>
        {isDraft ? (
          <ItemActions>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDelete(item.id)}
              disabled={isPending}
              className="text-muted-foreground hover:text-destructive"
            >
              <IconTrash className="size-4" />
            </Button>
          </ItemActions>
        ) : null}
      </ItemHeader>
      <ItemContent className="basis-full">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">{FORM_VI.quantity}</p>
            <p className="font-semibold">
              {formatQty(Number(item.quantity ?? 0))}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">{FORM_VI.unit}</p>
            <p className="font-semibold">
              {item.unit ?? item.ingredients?.unit ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Đơn giá (WAC)</p>
            <p className="font-semibold">
              {formatVND(Number(item.unit_cost ?? 0))}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">{FORM_VI.amount}</p>
            <p className="font-semibold text-primary">
              {formatVND(Number(item.total_cost ?? 0))}
            </p>
          </div>
        </div>
      </ItemContent>
      <ItemFooter className="basis-full">
        <div className="w-full rounded-md bg-background px-3 py-2 text-sm">
          <p className="text-muted-foreground">{tTerm("issueReason")}</p>
          <p className="mt-1">{item.reason ?? "—"}</p>
        </div>
      </ItemFooter>
    </Item>
  );
}
