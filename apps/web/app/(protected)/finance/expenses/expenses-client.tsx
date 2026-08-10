"use client";

import { useEffect, useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Banknote as IconBanknote,
  Copy as IconCopy,
  Landmark as IconLandmark,
  Pencil as IconPencil,
  Plus as IconPlus,
  RotateCcw as IconRotateCcw,
  Trash2 as IconTrash,
  TriangleAlert as IconAlertTriangle,
} from "lucide-react";
import {
  formatCount,
  formatAccountingVND,
  formatCompactVND,
} from "@comtammatu/shared/format";
import { formatVNBusinessDate } from "@comtammatu/shared/time";
import { EXPENSE_PAYMENT_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { confirm } from "@/components/confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { KpiCard } from "@/components/kpi/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { AppListFrame, AppPageHeader, KpiRow } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { FormDialog } from "@/components/form";
import { useDocumentOverlayUrl } from "@lib/navigation/use-document-overlay-url";
import { FilterBar } from "../components/filter-bar";
import { FinanceAmountCell } from "../components/finance-amount-cell";
import { moneyLabels } from "../components/finance-money-block";
import {
  canCorrectExpensePaymentMethod,
  classifyExpensePaymentState,
  expenseNeedsAction,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from "../_lib/expense-categories";
import type { FinanceParams } from "../_lib/finance-params";
import {
  EXPENSE_LIST_STATE_PARAM,
  type ExpenseListStateFilter,
} from "./expense-list-state";
import {
  createExpense,
  deleteExpense,
  transitionExpensePayment,
  updateExpense,
  type ExpenseRow,
} from "../expense-actions";
import { ExpenseFormFields } from "./expense-form-fields";
import {
  buildExpenseVatBreakdown,
  canDeleteExpense,
  copy,
  EMPTY_EXPENSE_LINE,
  expenseDetail,
  expenseFormSchema,
  expensePaymentMethod,
  expenseToFormValues,
  TENANT_LEVEL_BRANCH_VALUE,
  type ExpenseFormValues,
} from "./expense-form-schema";
import { ExpenseViewDialog } from "./expense-view-dialog";

const EXPENSE_OVERLAY_KEYS = ["expenseId", "mode"] as const;

interface Branch {
  id: number;
  name: string;
}

interface ExpenseListSummary {
  operatingTotal: string;
  operatingCount: number;
  needsActionTotal: string;
  needsActionCount: number;
}

interface Props {
  params: FinanceParams;
  branches: Branch[];
  rows: ExpenseRow[];
  summary: ExpenseListSummary;
  stateFilter: ExpenseListStateFilter | null;
  todayBusinessDate: string;
  canManageExpenses: boolean;
  tenantId: number;
}

export function ExpensesClient({
  params,
  branches,
  rows,
  summary,
  stateFilter,
  todayBusinessDate,
  canManageExpenses,
  tenantId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const overlay = useDocumentOverlayUrl(EXPENSE_OVERLAY_KEYS);
  const isTouchLayout = useIsMobile(1024);
  const showOnlyNeedsAction = stateFilter === "pending";
  const visibleRows = useMemo(
    () => (showOnlyNeedsAction ? rows.filter(expenseNeedsAction) : rows),
    [rows, showOnlyNeedsAction],
  );
  const [isMutating, startMutation] = useTransition();

  const mode = overlay.get("mode");
  const expenseIdRaw = overlay.get("expenseId");
  const parsedExpenseId = expenseIdRaw ? Number(expenseIdRaw) : null;
  const expenseId =
    parsedExpenseId != null &&
    Number.isInteger(parsedExpenseId) &&
    parsedExpenseId > 0
      ? parsedExpenseId
      : null;
  const selectedExpense = useMemo(
    () =>
      expenseId != null
        ? (rows.find((row) => row.id === expenseId) ?? null)
        : null,
    [rows, expenseId],
  );
  const createOpen = mode === "create";
  const viewOpen = mode === "view" && selectedExpense != null;
  const editOpen = mode === "edit" && selectedExpense != null;
  const formDialogOpen = canManageExpenses && (createOpen || editOpen);
  const viewingExpense = viewOpen ? selectedExpense : null;
  const editingExpense = editOpen ? selectedExpense : null;

  const { clearOverlay, patchOverlay } = overlay;

  useEffect(() => {
    if (mode == null || mode === "create") return;
    if (expenseId != null && selectedExpense == null) {
      clearOverlay();
    }
  }, [mode, expenseId, selectedExpense, clearOverlay]);

  const branchNames = new Map(branches.map((b) => [b.id, b.name]));
  const branchLabel = (branchId: number | null) =>
    branchId != null
      ? (branchNames.get(branchId) ?? `#${branchId}`)
      : copy.tenantLevel;

  function openExpenseDocument(row: ExpenseRow) {
    patchOverlay({ expenseId: row.id, mode: "view" }, "push");
  }

  function closeExpenseDocument() {
    clearOverlay();
  }

  function toggleNeedsActionFilter() {
    const next = new URLSearchParams(searchParams.toString());
    if (showOnlyNeedsAction) next.delete(EXPENSE_LIST_STATE_PARAM);
    else next.set(EXPENSE_LIST_STATE_PARAM, "pending");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  function categoryLabel(category: string) {
    return (
      (copy.categoryLabels as Record<string, string>)[category] ?? category
    );
  }

  function methodLabel(row: ExpenseRow) {
    const method = expensePaymentMethod(row);
    return (
      (copy.paymentMethodLabels as Record<string, string>)[method] ?? method
    );
  }

  const branchOptions = [
    { value: TENANT_LEVEL_BRANCH_VALUE, label: copy.form.branchTenantLevel },
    ...branches.map((b) => ({ value: String(b.id), label: b.name })),
  ];

  const defaultValues: ExpenseFormValues = {
    expenseDate: todayBusinessDate,
    branchId:
      params.branch != null ? String(params.branch) : TENANT_LEVEL_BRANCH_VALUE,
    category: "",
    paymentMethod: "cash",
    note: "",
    invoiceAttachmentUrl: "",
    lines: [EMPTY_EXPENSE_LINE],
  };

  const formDefaultValues: ExpenseFormValues = editingExpense
    ? expenseToFormValues(editingExpense)
    : defaultValues;

  const editingPaymentState = editingExpense
    ? classifyExpensePaymentState(editingExpense)
    : null;

  async function onSubmit(values: ExpenseFormValues): Promise<ActionResult> {
    const branchId =
      !values.branchId || values.branchId === TENANT_LEVEL_BRANCH_VALUE
        ? null
        : Number(values.branchId);
    const vatBreakdown = buildExpenseVatBreakdown(values);
    const attachment = values.invoiceAttachmentUrl?.trim();
    const nextMethod = values.paymentMethod as ExpensePaymentMethod;

    if (!editingExpense) {
      const result = await createExpense({
        branchId,
        expenseDate: values.expenseDate,
        category: values.category as ExpenseCategory,
        vatBreakdown,
        paymentMethod: nextMethod,
        note: values.note,
        invoiceAttachmentUrl: attachment || undefined,
      });
      if (result.success) router.refresh();
      return result;
    }

    const result = await updateExpense({
      expenseId: editingExpense.id,
      branchId,
      expenseDate: values.expenseDate,
      category: values.category as ExpenseCategory,
      vatBreakdown,
      note: values.note,
      invoiceAttachmentUrl: attachment || undefined,
    });
    if (!result.success) return result;

    const previousMethod = expensePaymentMethod(
      editingExpense,
    ) as ExpensePaymentMethod;
    if (
      nextMethod !== previousMethod &&
      canCorrectExpensePaymentMethod(editingExpense)
    ) {
      const transition = await transitionExpensePayment({
        expenseId: editingExpense.id,
        targetMethod: nextMethod,
      });
      if (!transition.success) {
        return {
          success: false,
          error: transition.error ?? copy.actions.updateFailed,
        };
      }
    }

    router.refresh();
    return result;
  }

  function onCreateSuccess(_result: ActionResult) {
    toast.success(editingExpense ? copy.form.editSuccess : copy.form.success);
    closeExpenseDocument();
  }

  function onEdit(row: ExpenseRow) {
    patchOverlay({ expenseId: row.id, mode: "edit" }, "replace");
  }

  function openCreateExpense() {
    patchOverlay({ expenseId: null, mode: "create" }, "push");
  }

  async function copyTransferContent(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(copy.transferInstruction.copied);
    } catch {
      toast.error(copy.transferInstruction.copyFailed);
    }
  }

  async function onDelete(row: ExpenseRow) {
    const ok = await confirm({
      title: copy.table.deleteTitle,
      description: copy.table.deleteConfirm(formatAccountingVND(row.amount)),
      confirmText: copy.table.deleteCta,
      cancelText: copy.table.deleteCancel,
      variant: "destructive",
    });
    if (!ok) return;
    startMutation(async () => {
      const result = await deleteExpense({ expenseId: row.id });
      if (result.success) {
        toast.success(copy.table.deleteSuccess);
        if (row.id === expenseId) closeExpenseDocument();
        router.refresh();
      } else {
        toast.error(result.error ?? copy.table.deleteFailed);
      }
    });
  }

  function runPaymentTransition(
    row: ExpenseRow,
    targetMethod: ExpensePaymentMethod,
  ) {
    startMutation(async () => {
      const result = await transitionExpensePayment({
        expenseId: row.id,
        targetMethod,
      });
      if (!result.success) {
        toast.error(result.error ?? copy.actions.updateFailed);
        return;
      }

      if (targetMethod === "cash") {
        toast.success(copy.actions.cashSuccess);
      } else if (targetMethod === "transfer") {
        toast.success(copy.actions.transferSuccess);
      } else {
        toast.success(copy.actions.cancelTransferSuccess);
      }
      closeExpenseDocument();
      router.refresh();
    });
  }

  async function onPayCash(row: ExpenseRow) {
    const ok = await confirm({
      title: copy.actions.cashTitle,
      description: copy.actions.cashConfirm(formatAccountingVND(row.amount)),
      confirmText: copy.actions.cashCta,
      cancelText: copy.actions.keepUnpaid,
    });
    if (ok) runPaymentTransition(row, "cash");
  }

  async function onPayTransfer(row: ExpenseRow) {
    const ok = await confirm({
      title: copy.actions.transferTitle,
      description: copy.actions.transferConfirm(
        formatAccountingVND(row.amount),
      ),
      confirmText: copy.actions.transferCta,
      cancelText: copy.actions.keepUnpaid,
    });
    if (ok) runPaymentTransition(row, "transfer");
  }

  async function onCancelTransfer(row: ExpenseRow) {
    const ok = await confirm({
      title: copy.actions.cancelTransferTitle,
      description: copy.actions.cancelTransferConfirm(
        row.transfer_content ?? "—",
      ),
      confirmText: copy.actions.cancelTransferCta,
      cancelText: copy.actions.keepTransfer,
    });
    if (ok) runPaymentTransition(row, "unpaid");
  }

  function getExpenseRowActions(row: ExpenseRow): RowActionItem[] {
    const paymentState = classifyExpensePaymentState(row);
    if (
      paymentState === "transfer_matched" ||
      row.category === "bank_deposit"
    ) {
      return [];
    }

    if (paymentState === "unpaid") {
      return [
        {
          key: "cash",
          label: copy.actions.cash,
          icon: <IconBanknote className="size-4" />,
          onSelect: () => void onPayCash(row),
          disabled: isMutating,
        },
        {
          key: "transfer",
          label: copy.actions.transfer,
          icon: <IconLandmark className="size-4" />,
          onSelect: () => void onPayTransfer(row),
          disabled: isMutating,
        },
        ...(canDeleteExpense(row)
          ? [
              {
                key: "edit",
                label: copy.table.edit,
                icon: <IconPencil className="size-4" />,
                onSelect: () => onEdit(row),
                disabled: isMutating,
                separatorBefore: true,
              } satisfies RowActionItem,
              {
                key: "delete",
                label: copy.table.delete,
                icon: <IconTrash className="size-4" />,
                onSelect: () => void onDelete(row),
                disabled: isMutating,
                destructive: true,
              } satisfies RowActionItem,
            ]
          : []),
      ];
    }

    if (paymentState === "transfer_needs_match" && row.transfer_content) {
      return [
        {
          key: "copy",
          label: copy.transferInstruction.copy,
          icon: <IconCopy className="size-4" />,
          onSelect: () => void copyTransferContent(row.transfer_content!),
        },
        {
          key: "cancel-transfer",
          label: copy.actions.cancelTransfer,
          icon: <IconRotateCcw className="size-4" />,
          onSelect: () => void onCancelTransfer(row),
          disabled: isMutating,
        },
      ];
    }

    if (row.transfer_content) {
      return [
        {
          key: "copy",
          label: copy.transferInstruction.copy,
          icon: <IconCopy className="size-4" />,
          onSelect: () => void copyTransferContent(row.transfer_content!),
        },
      ];
    }

    return canDeleteExpense(row)
      ? [
          {
            key: "edit",
            label: copy.table.edit,
            icon: <IconPencil className="size-4" />,
            onSelect: () => onEdit(row),
            disabled: isMutating,
          } satisfies RowActionItem,
          {
            key: "delete",
            label: copy.table.delete,
            icon: <IconTrash className="size-4" />,
            onSelect: () => void onDelete(row),
            disabled: isMutating,
            destructive: true,
          },
        ]
      : [];
  }

  const columns: DataTableColumn<ExpenseRow>[] = [
    {
      key: "date",
      header: copy.table.date,
      className: "w-28 font-mono tabular-nums",
      render: (row) => formatVNBusinessDate(row.expense_date),
    },
    {
      key: "category",
      header: copy.table.category,
      render: (row) => categoryLabel(row.category),
    },
    {
      key: "branch",
      header: copy.table.branch,
      className: "text-muted-foreground",
      render: (row) => branchLabel(row.branch_id),
    },
    {
      key: "method",
      header: copy.table.method,
      render: (row) => methodLabel(row),
    },
    {
      key: "subtotal",
      header: moneyLabels.subtotalExVat,
      className: "text-right",
      render: (row) => (
        <FinanceAmountCell amount={row.subtotal} basis="exVat" />
      ),
    },
    {
      key: "vat",
      header: copy.table.vat,
      className: "text-right",
      render: (row) => <FinanceAmountCell amount={row.vat_amount} />,
    },
    {
      key: "amount",
      header: moneyLabels.totalInclVat,
      className: "text-right",
      render: (row) => (
        <FinanceAmountCell amount={row.amount} basis="inclVat" />
      ),
    },
    {
      key: "paymentState",
      header: copy.table.paymentState,
      render: (row) => (
        <StatusBadge
          domain="expense-payment"
          value={classifyExpensePaymentState(row)}
        />
      ),
    },
    {
      key: "detail",
      header: copy.table.detail,
      className: "max-w-48 truncate text-muted-foreground",
      render: (row) => expenseDetail(row) || "—",
    },
    ...(canManageExpenses
      ? [
          {
            key: "actions",
            header: "",
            className: "w-12",
            render: (row: ExpenseRow) => {
              const items = getExpenseRowActions(row);
              return items.length > 0 ? (
                <div
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <RowActionsMenu
                    items={items}
                    label={copy.table.actions}
                    triggerSize="icon-sm"
                  />
                </div>
              ) : null;
            },
          } satisfies DataTableColumn<ExpenseRow>,
        ]
      : []),
  ];

  return (
    <>
      <AppPageHeader
        title={copy.page.title}
        description={copy.page.description}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size={isTouchLayout ? "touch" : "default"}
              variant={showOnlyNeedsAction ? "default" : "outline"}
              onClick={toggleNeedsActionFilter}
              aria-pressed={showOnlyNeedsAction}
            >
              <IconAlertTriangle data-icon="inline-start" />
              {copy.needsActionFilter}
            </Button>
            {canManageExpenses ? (
              <Button
                size={isTouchLayout ? "touch" : "default"}
                onClick={openCreateExpense}
              >
                <IconPlus data-icon="inline-start" />
                {copy.add}
              </Button>
            ) : null}
          </div>
        }
      />

      <KpiRow density="compact">
        <KpiCard
          label={copy.totalLabel}
          value={formatAccountingVND(summary.operatingTotal)}
          shortValue={formatCompactVND(summary.operatingTotal)}
          valueLabel={`${copy.totalLabel}: ${formatAccountingVND(summary.operatingTotal)}`}
          hint={copy.totalHint(formatCount(summary.operatingCount))}
          tone="primary"
          density="compact"
        />
        <KpiCard
          label={copy.needsActionLabel}
          value={formatAccountingVND(summary.needsActionTotal)}
          shortValue={formatCompactVND(summary.needsActionTotal)}
          valueLabel={`${copy.needsActionLabel}: ${formatAccountingVND(summary.needsActionTotal)}`}
          hint={copy.needsActionHint(formatCount(summary.needsActionCount))}
          tone={summary.needsActionCount > 0 ? "warning" : "neutral"}
          density="compact"
        />
      </KpiRow>

      <AppListFrame
        title={copy.listTitle}
        contentScroll
        toolbar={
          <FilterBar
            variant="inline"
            params={params}
            branches={branches}
            basePath="/finance/expenses"
            locationFilter
            hide={["compare", "granularity"]}
          />
        }
      >
        <DataTable
          columns={columns}
          data={visibleRows}
          pageSize={50}
          getRowKey={(row) => row.id}
          onRowClick={openExpenseDocument}
          getRowAriaLabel={(row) =>
            copy.form.openAria(categoryLabel(row.category))
          }
          getRowDataState={(row) =>
            row.id === expenseId ? "selected" : undefined
          }
          renderRowContextMenu={(row) => {
            if (!canManageExpenses) return null;
            const items = getExpenseRowActions(row);
            return items.length > 0 ? (
              <RowActionsContextMenuItems items={items} />
            ) : null;
          }}
          emptyMode="no-data"
          emptyTitle={
            showOnlyNeedsAction ? copy.empty.clearedTitle : copy.empty.title
          }
          emptyDescription={
            showOnlyNeedsAction
              ? copy.empty.clearedDescription
              : copy.empty.description
          }
          mobileCardRender={(row) => {
            const detail = expenseDetail(row);
            const actionItems = getExpenseRowActions(row);
            return (
              <Item
                variant="outline"
                role="button"
                tabIndex={0}
                aria-label={copy.form.openAria(categoryLabel(row.category))}
                className="cursor-pointer"
                onClick={() => openExpenseDocument(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openExpenseDocument(row);
                  }
                }}
              >
                <ItemHeader>
                  <ItemContent>
                    <ItemTitle>{categoryLabel(row.category)}</ItemTitle>
                    <ItemDescription>
                      {formatVNBusinessDate(row.expense_date)} ·{" "}
                      {branchLabel(row.branch_id)} · {methodLabel(row)}
                    </ItemDescription>
                  </ItemContent>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge
                      domain="expense-payment"
                      value={classifyExpensePaymentState(row)}
                    />
                    {canManageExpenses && actionItems.length > 0 ? (
                      <ItemActions
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <RowActionsMenu
                          items={actionItems}
                          label={copy.table.actions}
                          triggerSize="icon-touch"
                        />
                      </ItemActions>
                    ) : null}
                  </div>
                </ItemHeader>
                <ItemFooter className="items-end gap-2">
                  <ItemDescription className="min-w-0 flex-1">
                    {detail || "—"}
                  </ItemDescription>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="shrink-0 whitespace-nowrap font-mono text-sm font-semibold tabular-nums">
                      {formatAccountingVND(row.amount)}
                    </span>
                  </div>
                </ItemFooter>
              </Item>
            );
          }}
        />
      </AppListFrame>

      {canManageExpenses ? (
        <FormDialog
          open={formDialogOpen}
          onOpenChange={(open) => {
            if (!open) closeExpenseDocument();
          }}
          title={editingExpense ? copy.form.editTitle : copy.form.title}
          description={
            editingExpense && editingPaymentState
              ? EXPENSE_PAYMENT_STATE_LABELS_VI[editingPaymentState]
              : undefined
          }
          schema={expenseFormSchema}
          defaultValues={formDefaultValues}
          entityKey={editingExpense?.id ?? "create"}
          onSubmit={onSubmit}
          onSuccess={onCreateSuccess}
          submitLabel={editingExpense ? copy.form.editSubmit : copy.form.submit}
          variant="document"
          renderFooter={
            editingExpense &&
            (editingPaymentState === "unpaid" ||
              editingPaymentState === "transfer_needs_match")
              ? ({
                  formId,
                  isPending,
                  requestClose,
                  submitLabel,
                  actionSize,
                  cancelLabel,
                }) => (
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size={actionSize}
                      onClick={requestClose}
                      disabled={isPending || isMutating}
                    >
                      {cancelLabel}
                    </Button>
                    {editingPaymentState === "unpaid" ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size={actionSize}
                          disabled={isPending || isMutating}
                          onClick={() => void onPayCash(editingExpense)}
                        >
                          {isMutating ? <Spinner /> : null}
                          <IconBanknote data-icon="inline-start" />
                          {copy.actions.cash}
                        </Button>
                        <Button
                          type="button"
                          size={actionSize}
                          disabled={isPending || isMutating}
                          onClick={() => void onPayTransfer(editingExpense)}
                        >
                          {isMutating ? <Spinner /> : null}
                          <IconLandmark data-icon="inline-start" />
                          {copy.actions.transfer}
                        </Button>
                      </>
                    ) : null}
                    {editingPaymentState === "transfer_needs_match" &&
                    editingExpense.transfer_content ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size={actionSize}
                          disabled={isPending || isMutating}
                          onClick={() =>
                            void copyTransferContent(
                              editingExpense.transfer_content!,
                            )
                          }
                        >
                          <IconCopy data-icon="inline-start" />
                          {copy.transferInstruction.copy}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size={actionSize}
                          disabled={isPending || isMutating}
                          onClick={() => void onCancelTransfer(editingExpense)}
                        >
                          {isMutating ? <Spinner /> : null}
                          <IconRotateCcw data-icon="inline-start" />
                          {copy.actions.cancelTransfer}
                        </Button>
                      </>
                    ) : null}
                    <Button
                      type="submit"
                      form={formId}
                      variant="outline"
                      size={actionSize}
                      disabled={isPending || isMutating}
                    >
                      {isPending ? <Spinner /> : null}
                      {submitLabel}
                    </Button>
                  </div>
                )
              : undefined
          }
        >
          {(form) => {
            const canEditPaymentMethod =
              editingExpense == null ||
              canCorrectExpensePaymentMethod(editingExpense);
            return (
              <ExpenseFormFields
                form={form}
                branchOptions={branchOptions}
                tenantId={tenantId}
                isTouchLayout={isTouchLayout}
                paymentMethodReadOnly={!canEditPaymentMethod}
                transferContent={editingExpense?.transfer_content}
                paymentState={editingPaymentState}
                onCopyTransferContent={(content) =>
                  void copyTransferContent(content)
                }
              />
            );
          }}
        </FormDialog>
      ) : null}

      <ExpenseViewDialog
        expense={viewingExpense}
        branchOptions={branchOptions}
        tenantId={tenantId}
        isTouchLayout={isTouchLayout}
        onClose={closeExpenseDocument}
        onCopyTransferContent={(content) => void copyTransferContent(content)}
      />
    </>
  );
}
