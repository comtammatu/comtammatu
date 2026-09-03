"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Banknote as IconBanknote,
  Copy as IconCopy,
  Landmark as IconLandmark,
  Pencil as IconPencil,
  Plus as IconPlus,
  RotateCcw as IconRotateCcw,
  Search as IconSearch,
  Trash2 as IconTrash,
  TriangleAlert as IconAlertTriangle,
} from "lucide-react";
import { formatAccountingVND } from "@comtammatu/shared/format";
import { formatVNBusinessDate } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { cn } from "@comtammatu/ui/lib/utils";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { confirm } from "@/components/confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { StatusBadge } from "@/components/status-badge";
import { AppListFrame, AppPageHeader } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { FormDialog } from "@/components/form";
import { useFormControlSize } from "@/components/form/control-size";
import { messages } from "@lib/messages";
import { useDocumentOverlayUrl } from "@lib/navigation/use-document-overlay-url";
import { FilterBar } from "../components/filter-bar";
import { FinanceAmountCell } from "../components/finance-amount-cell";
import { moneyLabels } from "../components/finance-money-block";
import {
  canCorrectExpensePaymentMethod,
  classifyExpensePaymentState,
  EXPENSE_CATEGORIES_BY_GROUP,
  expenseNeedsAction,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from "../_lib/expense-categories";
import type { FinanceParams } from "../_lib/finance-params";
import {
  EXPENSE_LIST_KIND_PARAM,
  EXPENSE_LIST_QUERY_PARAM,
  EXPENSE_LIST_STATE_PARAM,
  filterExpenseRows,
  type ExpenseListFilters,
} from "./expense-list-state";
import {
  createExpense,
  deleteExpense,
  transitionExpensePayment,
  updateExpense,
  type ExpenseRow,
} from "../expense-actions";
import { ExpenseFormFields } from "./expense-form-fields";
import { ExpenseListKpis } from "./expense-list-kpis";
import {
  buildExpenseVatBreakdown,
  canDeleteExpense,
  copy,
  EMPTY_EXPENSE_LINE,
  expenseCategoryBucketLabel,
  expenseFormSchema,
  expenseKindOptionLabel,
  expensePaymentMethod,
  expensePurpose,
  expenseToFormValues,
  TENANT_LEVEL_BRANCH_VALUE,
  type ExpenseFormValues,
} from "./expense-form-schema";
import { ExpenseViewDialog } from "./expense-view-dialog";

const EXPENSE_OVERLAY_KEYS = ["expenseId", "mode"] as const;
const EXPENSE_KIND_ALL = "all";

interface Branch {
  id: number;
  name: string;
}

interface ExpenseListSummary {
  operatingTotal: string;
  operatingCount: number;
  startupTotal: string;
  startupCount: number;
  needsActionTotal: string;
  needsActionCount: number;
}

interface Props {
  params: FinanceParams;
  branches: Branch[];
  rows: ExpenseRow[];
  summary: ExpenseListSummary;
  listFilters: ExpenseListFilters;
  todayBusinessDate: string;
  canManageExpenses: boolean;
  tenantId: number;
  listMode?: "ledger" | "equipment" | "construction";
}

export function ExpensesClient({
  params,
  branches,
  rows,
  summary,
  listFilters,
  todayBusinessDate,
  canManageExpenses,
  tenantId,
  listMode = "ledger",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const overlay = useDocumentOverlayUrl(EXPENSE_OVERLAY_KEYS);
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const isEquipmentList = listMode === "equipment";
  const isConstructionList = listMode === "construction";
  const isLockedCategoryList = isEquipmentList || isConstructionList;
  const lockedCopy = isConstructionList
    ? messages.finance.construction
    : messages.finance.equipment;
  const pageCopy = isLockedCategoryList ? lockedCopy.page : copy.page;
  const listTitle = isLockedCategoryList ? lockedCopy.listTitle : copy.listTitle;
  const emptyCopy = isLockedCategoryList ? lockedCopy.empty : copy.empty;
  const lockedCategory = isConstructionList
    ? ("construction" as const)
    : isEquipmentList
      ? ("capital" as const)
      : undefined;
  const listBasePath = isConstructionList
    ? "/finance/construction"
    : isEquipmentList
      ? "/finance/equipment"
      : "/finance/expenses";
  const showOnlyNeedsAction = listFilters.state === "pending";
  const hasTextFilters =
    listFilters.query.length > 0 || listFilters.kind != null;
  const [queryDraft, setQueryDraft] = useState(listFilters.query);
  const [isMutating, startMutation] = useTransition();
  const controlSize = useFormControlSize();
  const optionSize = controlSize === "touch" ? "touch" : "default";

  const visibleRows = useMemo(
    () =>
      filterExpenseRows(rows, listFilters, {
        ignoreKind: isLockedCategoryList,
        categoryLabel: (category) =>
          (copy.categoryLabels as Record<string, string>)[category] ?? category,
      }),
    [isLockedCategoryList, listFilters, rows],
  );

  const mode = overlay.get("mode");
  const expenseIdRaw = overlay.get("expenseId");
  const parsedExpenseId = expenseIdRaw ? Number(expenseIdRaw) : NaN;
  const expenseId =
    Number.isInteger(parsedExpenseId) && parsedExpenseId > 0
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
      ? (branchNames.get(branchId) ?? copy.branchFallback)
      : copy.tenantLevel;

  function openExpenseDocument(row: ExpenseRow) {
    patchOverlay({ expenseId: row.id, mode: "view" }, "push");
  }

  function closeExpenseDocument() {
    clearOverlay();
  }

  function closeExpenseForm() {
    if (editingExpense) {
      patchOverlay({ expenseId: editingExpense.id, mode: "view" }, "replace");
      return;
    }
    closeExpenseDocument();
  }

  const patchListFilters = useCallback(
    (next: {
      q?: string | null;
      kind?: string | null;
      state?: "pending" | null;
    }) => {
      const params = new URLSearchParams(searchParams.toString());
      if ("q" in next) {
        if (next.q) params.set(EXPENSE_LIST_QUERY_PARAM, next.q);
        else params.delete(EXPENSE_LIST_QUERY_PARAM);
      }
      if ("kind" in next) {
        if (next.kind) params.set(EXPENSE_LIST_KIND_PARAM, next.kind);
        else params.delete(EXPENSE_LIST_KIND_PARAM);
      }
      if ("state" in next) {
        if (next.state) params.set(EXPENSE_LIST_STATE_PARAM, next.state);
        else params.delete(EXPENSE_LIST_STATE_PARAM);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    setQueryDraft(listFilters.query);
  }, [listFilters.query]);

  useEffect(() => {
    const trimmed = queryDraft.trim();
    if (trimmed === listFilters.query) return;
    const timer = window.setTimeout(() => {
      patchListFilters({ q: trimmed || null });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [listFilters.query, patchListFilters, queryDraft]);

  function toggleNeedsActionFilter() {
    patchListFilters({
      state: showOnlyNeedsAction ? null : "pending",
    });
  }

  function categoryLabel(category: string) {
    return (copy.categoryLabels as Record<string, string>)[category] ?? category;
  }

  function categoryCell(category: string) {
    return (
      <div className="min-w-0">
        <div>{categoryLabel(category)}</div>
        <div className="text-xs text-muted-foreground">
          {expenseCategoryBucketLabel(category)}
        </div>
      </div>
    );
  }

  function methodLabel(row: ExpenseRow) {
    const method = expensePaymentMethod(row);
    return (copy.paymentMethodLabels as Record<string, string>)[method] ?? method;
  }

  const branchOptions = [
    { value: TENANT_LEVEL_BRANCH_VALUE, label: copy.form.branchTenantLevel },
    ...branches.map((b) => ({ value: String(b.id), label: b.name })),
  ];

  const defaultValues: ExpenseFormValues = {
    expenseDate: todayBusinessDate,
    branchId: String(
      params.branch ?? branches[0]?.id ?? TENANT_LEVEL_BRANCH_VALUE,
    ),
    category: lockedCategory ?? "",
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

    const previousMethod = expensePaymentMethod(editingExpense) as ExpensePaymentMethod;
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
    if (editingExpense) {
      patchOverlay({ expenseId: editingExpense.id, mode: "view" }, "replace");
      return;
    }
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
      if (expenseId === row.id) {
        patchOverlay({ expenseId: row.id, mode: "view" }, "replace");
      }
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
      sortable: true,
      sortValue: (row) => row.expense_date,
      render: (row) => formatVNBusinessDate(row.expense_date),
    },
    {
      key: "purpose",
      header: copy.table.detail,
      className: "min-w-44 max-w-sm",
      sortable: true,
      sortValue: (row) => expensePurpose(row).title,
      render: (row) => {
        const purpose = expensePurpose(row);
        return (
          <div className="min-w-0">
            <div className="line-clamp-2 font-medium text-foreground">
              {purpose.title || "—"}
            </div>
            {purpose.subtitle ? (
              <div className="truncate text-xs text-muted-foreground">
                {purpose.subtitle}
              </div>
            ) : null}
          </div>
        );
      },
    },
    ...(!isLockedCategoryList
      ? [
          {
            key: "category",
            header: copy.table.category,
            sortable: true,
            sortValue: (row: ExpenseRow) => row.category,
            render: (row: ExpenseRow) => categoryCell(row.category),
          } satisfies DataTableColumn<ExpenseRow>,
        ]
      : []),
    {
      key: "branch",
      header: copy.table.branch,
      className: "text-muted-foreground",
      sortable: true,
      sortValue: (row) => row.branch_id ?? -1,
      render: (row) => branchLabel(row.branch_id),
    },
    {
      key: "method",
      header: copy.table.method,
      sortable: true,
      sortValue: (row) => row.payment_method,
      render: (row) => methodLabel(row),
    },
    {
      key: "amount",
      header: moneyLabels.totalInclVat,
      className: "text-right",
      sortable: true,
      sortValue: (row) => Number(row.amount),
      render: (row) => <FinanceAmountCell amount={row.amount} basis="inclVat" />,
    },
    {
      key: "paymentState",
      header: copy.table.paymentState,
      render: (row) => <StatusBadge domain="expense-payment" value={classifyExpensePaymentState(row)} />,
    },
    ...(canManageExpenses
      ? [{
          key: "actions",
          header: "",
          className: "w-12",
          render: (row: ExpenseRow) => {
            const items = getExpenseRowActions(row);
            return items.length > 0 ? (
              <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                <RowActionsMenu items={items} label={copy.table.actions} triggerSize={isTouchLayout ? "icon-touch" : "icon"} />
              </div>
            ) : null;
          },
        } satisfies DataTableColumn<ExpenseRow>]
      : []),
  ];

  const needsActionFilterButton = (
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
  );

  return (
    <>
      <AppPageHeader
        title={pageCopy.title}
        actions={
          canManageExpenses ? (
            <Button
              size={isTouchLayout ? "touch" : "default"}
              onClick={openCreateExpense}
            >
              <IconPlus data-icon="inline-start" />
              {isLockedCategoryList ? lockedCopy.add : copy.add}
            </Button>
          ) : undefined
        }
      />

      <ExpenseListKpis
        listMode={listMode}
        operatingTotal={summary.operatingTotal}
        operatingCount={summary.operatingCount}
        startupTotal={summary.startupTotal}
        startupCount={summary.startupCount}
        needsActionTotal={summary.needsActionTotal}
        needsActionCount={summary.needsActionCount}
        isNeedsActionActive={showOnlyNeedsAction}
        onToggleNeedsAction={toggleNeedsActionFilter}
      />

      <AppListFrame
        title={listTitle}
        contentScroll
        toolbar={
          <FilterBar
            variant="inline"
            params={params}
            branches={branches}
            basePath={listBasePath}
            hide={
              isLockedCategoryList
                ? ["branch", "compare", "granularity", "range"]
                : ["branch", "compare", "granularity"]
            }
            locationFilter={isLockedCategoryList}
            search={
              <InputGroup size={controlSize} className="min-w-0 flex-1">
                <InputGroupAddon>
                  <IconSearch aria-hidden />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  aria-label={copy.searchPlaceholder}
                  value={queryDraft}
                  onChange={(event) => setQueryDraft(event.target.value)}
                  placeholder={copy.searchPlaceholder}
                />
              </InputGroup>
            }
            extraFilters={
              isLockedCategoryList ? null : (
                <Select
                  value={listFilters.kind ?? EXPENSE_KIND_ALL}
                  onValueChange={(value) =>
                    patchListFilters({
                      kind: value === EXPENSE_KIND_ALL ? null : value,
                    })
                  }
                >
                  <SelectTrigger
                    size={controlSize}
                    className="w-full sm:w-56"
                    aria-label={copy.kindFilter}
                  >
                    <SelectValue placeholder={copy.kindFilter} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EXPENSE_KIND_ALL} size={optionSize}>
                      {copy.kindLabels.all}
                    </SelectItem>
                    <SelectGroup>
                      <SelectLabel>{copy.kindLabels.operating}</SelectLabel>
                      <SelectItem value="operating" size={optionSize}>
                        {copy.kindLabels.operating}
                      </SelectItem>
                      {EXPENSE_CATEGORIES_BY_GROUP.operating.map((category) => (
                        <SelectItem
                          key={category}
                          value={category}
                          size={optionSize}
                        >
                          {expenseKindOptionLabel(category)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>{copy.kindLabels.startup}</SelectLabel>
                      <SelectItem value="startup" size={optionSize}>
                        {copy.kindLabels.startup}
                      </SelectItem>
                      {EXPENSE_CATEGORIES_BY_GROUP.startup.map((category) => (
                        <SelectItem
                          key={category}
                          value={category}
                          size={optionSize}
                        >
                          {expenseKindOptionLabel(category)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )
            }
            trailing={needsActionFilterButton}
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
            copy.form.openAria(
              expensePurpose(row).title || categoryLabel(row.category),
            )
          }
          getRowDataState={(row) =>
            row.id === expenseId ? "selected" : undefined
          }
          rowClassName={(row) =>
            expenseNeedsAction(row) ? "border-l-2 border-l-warning" : undefined
          }
          renderRowContextMenu={(row) => {
            if (!canManageExpenses) return null;
            const items = getExpenseRowActions(row);
            return items.length > 0 ? (
              <RowActionsContextMenuItems items={items} />
            ) : null;
          }}
          emptyMode={hasTextFilters ? "no-results" : "no-data"}
          emptyTitle={
            hasTextFilters
              ? emptyCopy.filteredTitle
              : showOnlyNeedsAction
                ? emptyCopy.clearedTitle
                : emptyCopy.title
          }
          emptyDescription={
            hasTextFilters
              ? emptyCopy.filteredDescription
              : showOnlyNeedsAction
                ? emptyCopy.clearedDescription
                : emptyCopy.description
          }
          mobileCardRender={(row) => {
            const purpose = expensePurpose(row);
            const title =
              purpose.title || categoryLabel(row.category);
            const actionItems = getExpenseRowActions(row);
            return (
              <Item
                variant="outline"
                className={cn(
                  "min-h-16 flex-nowrap p-3 touch-manipulation cursor-pointer bg-card hover:bg-muted/30 transition-colors",
                  expenseNeedsAction(row) && "border-l-2 border-l-warning",
                )}
                render={<button type="button" onClick={() => openExpenseDocument(row)} />}
                aria-label={copy.form.openAria(title)}
              >
                <ItemContent className="min-w-0 gap-1.5 text-left">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <ItemTitle size="heading" className="line-clamp-2 font-semibold text-sm">
                      {title}
                    </ItemTitle>
                    <StatusBadge
                      domain="expense-payment"
                      value={classifyExpensePaymentState(row)}
                      size="sm"
                    />
                  </div>
                  <ItemDescription className="line-clamp-none flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{categoryLabel(row.category)}</span>
                    <span>· {expenseCategoryBucketLabel(row.category)}</span>
                    <span>· {formatVNBusinessDate(row.expense_date)}</span>
                    <span>· {branchLabel(row.branch_id)}</span>
                    <span>· {methodLabel(row)}</span>
                  </ItemDescription>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                    {purpose.subtitle ? (
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {purpose.subtitle}
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="font-mono text-sm font-semibold tabular-nums text-foreground shrink-0">
                      {formatAccountingVND(row.amount)}
                    </span>
                  </div>
                </ItemContent>
                {canManageExpenses && actionItems.length > 0 ? (
                  <ItemActions
                    className="shrink-0 self-center"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <RowActionsMenu
                      items={actionItems}
                      label={copy.table.actions}
                      triggerSize={isTouchLayout ? "icon-touch" : "icon"}
                    />
                  </ItemActions>
                ) : null}
              </Item>
            );
          }}
        />
      </AppListFrame>

      {canManageExpenses ? (
        <FormDialog
          open={formDialogOpen}
          onOpenChange={(open) => {
            if (!open) closeExpenseForm();
          }}
          title={
            editingExpense && editingPaymentState ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>{copy.form.editTitle}</span>
                <StatusBadge
                  domain="expense-payment"
                  value={editingPaymentState}
                />
              </div>
            ) : editingExpense ? (
              isLockedCategoryList
                ? lockedCopy.formEditTitle
                : copy.form.editTitle
            ) : (
              isLockedCategoryList ? lockedCopy.formTitle : copy.form.title
            )
          }
          schema={expenseFormSchema}
          defaultValues={formDefaultValues}
          entityKey={editingExpense?.id ?? "create"}
          onSubmit={onSubmit}
          onSuccess={onCreateSuccess}
          submitLabel={editingExpense ? copy.form.editSubmit : copy.form.submit}
          actionSize={isTouchLayout ? "touch" : "default"}
          variant="document"
          renderFooter={
            editingExpense &&
            (editingPaymentState === "unpaid" ||
              editingPaymentState === "transfer_needs_match")
              ? ({ formId, isPending, requestClose, submitLabel, actionSize, cancelLabel }) => (
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                    <Button type="button" variant="outline" size={actionSize} onClick={requestClose} disabled={isPending || isMutating}>
                      {cancelLabel}
                    </Button>
                    {editingPaymentState === "unpaid" ? (
                      <>
                        <Button type="button" variant="outline" size={actionSize} disabled={isPending || isMutating} onClick={() => void onPayCash(editingExpense)}>
                          {isMutating ? <Spinner /> : null}
                          <IconBanknote data-icon="inline-start" />
                          {copy.actions.cash}
                        </Button>
                        <Button type="button" size={actionSize} disabled={isPending || isMutating} onClick={() => void onPayTransfer(editingExpense)}>
                          {isMutating ? <Spinner /> : null}
                          <IconLandmark data-icon="inline-start" />
                          {copy.actions.transfer}
                        </Button>
                      </>
                    ) : null}
                    {editingPaymentState === "transfer_needs_match" && editingExpense.transfer_content ? (
                      <>
                        <Button type="button" variant="outline" size={actionSize} disabled={isPending || isMutating} onClick={() => void copyTransferContent(editingExpense.transfer_content!)}>
                          <IconCopy data-icon="inline-start" />
                          {copy.transferInstruction.copy}
                        </Button>
                        <Button type="button" variant="outline" size={actionSize} disabled={isPending || isMutating} onClick={() => void onCancelTransfer(editingExpense)}>
                          {isMutating ? <Spinner /> : null}
                          <IconRotateCcw data-icon="inline-start" />
                          {copy.actions.cancelTransfer}
                        </Button>
                      </>
                    ) : null}
                    <Button type="submit" form={formId} variant="outline" size={actionSize} disabled={isPending || isMutating}>
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
                onCopyTransferContent={(content) =>
                  void copyTransferContent(content)
                }
                lockedCategory={lockedCategory}
              />
            );
          }}
        </FormDialog>
      ) : null}

      <ExpenseViewDialog
        expense={viewingExpense}
        branchOptions={branchOptions}
        isTouchLayout={isTouchLayout}
        canManageExpenses={canManageExpenses}
        onClose={closeExpenseDocument}
        onEdit={onEdit}
        onPayCash={(row) => void onPayCash(row)}
        onPayTransfer={(row) => void onPayTransfer(row)}
        onCopyTransferContent={(content) => void copyTransferContent(content)}
      />
    </>
  );
}
