"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  Banknote as IconBanknote,
  Copy as IconCopy,
  Landmark as IconLandmark,
  Plus as IconPlus,
  RotateCcw as IconRotateCcw,
  Trash2 as IconTrash,
} from "lucide-react";
import { formatCount, formatVND } from "@comtammatu/shared/format";
import { formatVNBusinessDate } from "@comtammatu/shared/time";
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
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { KpiCard } from "@/components/kpi/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { AppSection, KpiRow } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  AppDialog,
  BusinessDateField,
  FormDialog,
  MoneyVndField,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/form";
import { messages } from "@lib/messages";
import { FilterBar } from "../components/filter-bar";
import {
  EXPENSE_CATEGORIES_BY_GROUP,
  EXPENSE_CATEGORY_GROUPS,
  EXPENSE_PAYMENT_METHODS,
  classifyExpensePaymentState,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from "../_lib/expense-categories";
import type { FinanceParams } from "../_lib/finance-params";
import {
  createExpense,
  deleteExpense,
  transitionExpensePayment,
  type ExpenseRow,
} from "../expense-actions";

const copy = messages.finance.expenses;
const TENANT_LEVEL_BRANCH_VALUE = "__tenant__";
interface Branch {
  id: number;
  name: string;
}

interface Props {
  params: FinanceParams;
  branches: Branch[];
  rows: ExpenseRow[];
  totalAmount: number;
  todayBusinessDate: string;
  canManageExpenses: boolean;
}

const expenseFormSchema = z.object({
  expenseDate: z.string().min(1, { error: "Chọn ngày phát sinh" }),
  branchId: z.string(),
  category: z.string().min(1, { error: "Chọn khoản mục" }),
  amount: z
    .string()
    .min(1, { error: "Nhập số tiền" })
    .refine((v) => Number(v) > 0, { error: "Số tiền phải lớn hơn 0" }),
  paymentMethod: z.string().min(1, { error: "Chọn phương thức" }),
  vendorName: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

const EXPENSE_FORM_CATEGORY_GROUPS = EXPENSE_CATEGORY_GROUPS.filter(
  (group) => group !== "materials" && group !== "transfer",
);

const CATEGORY_GROUPS = EXPENSE_FORM_CATEGORY_GROUPS.map((group) => ({
  label: copy.categoryGroupLabels[group],
  options: EXPENSE_CATEGORIES_BY_GROUP[group].map((value) => ({
    value,
    label: copy.categoryLabels[value],
  })),
}));

const METHOD_OPTIONS = EXPENSE_PAYMENT_METHODS.map((value) => ({
  value,
  label: copy.paymentChoiceLabels[value],
}));

function expenseDetail(row: ExpenseRow): string {
  return [
    row.vendor_name,
    row.note,
    row.transfer_content
      ? copy.transferInstruction.detail(row.transfer_content)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function expensePaymentMethod(row: ExpenseRow): string {
  return row.transfer_content ? "transfer" : row.payment_method;
}

function canDeleteExpense(row: ExpenseRow): boolean {
  return (
    row.category !== "bank_deposit" &&
    row.transfer_content == null &&
    row.matchedEventIds.length === 0
  );
}

export function ExpensesClient({
  params,
  branches,
  rows,
  totalAmount,
  todayBusinessDate,
  canManageExpenses,
}: Props) {
  const router = useRouter();
  const isTouchLayout = useIsMobile(1024);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [transferInstruction, setTransferInstruction] = useState<string | null>(
    null,
  );
  const [isMutating, startMutation] = useTransition();

  const branchNames = new Map(branches.map((b) => [b.id, b.name]));
  const branchLabel = (branchId: number | null) =>
    branchId != null
      ? (branchNames.get(branchId) ?? `#${branchId}`)
      : copy.tenantLevel;

  const branchOptions = [
    { value: TENANT_LEVEL_BRANCH_VALUE, label: copy.form.branchTenantLevel },
    ...branches.map((b) => ({ value: String(b.id), label: b.name })),
  ];

  const defaultValues: ExpenseFormValues = {
    expenseDate: todayBusinessDate,
    branchId:
      params.branch != null ? String(params.branch) : TENANT_LEVEL_BRANCH_VALUE,
    category: "",
    amount: "",
    paymentMethod: "cash",
    vendorName: "",
    note: "",
  };

  async function onSubmit(values: ExpenseFormValues): Promise<ActionResult> {
    const branchId =
      !values.branchId || values.branchId === TENANT_LEVEL_BRANCH_VALUE
        ? null
        : Number(values.branchId);

    const result = await createExpense({
      branchId,
      expenseDate: values.expenseDate,
      category: values.category as ExpenseCategory,
      amount: Number(values.amount),
      paymentMethod: values.paymentMethod as ExpensePaymentMethod,
      vendorName: values.vendorName || undefined,
      note: values.note || undefined,
    });
    if (result.success) {
      router.refresh();
    }
    return result;
  }

  function onCreateSuccess(result: ActionResult) {
    const data = result.data as { transferContent?: string } | undefined;
    if (data?.transferContent) {
      setTransferInstruction(data.transferContent);
      toast.success(copy.transferInstruction.created);
    } else {
      toast.success(copy.form.success);
    }
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
      description: copy.table.deleteConfirm(formatVND(row.amount)),
      confirmText: copy.table.deleteCta,
      cancelText: copy.table.deleteCancel,
      variant: "destructive",
    });
    if (!ok) return;
    startMutation(async () => {
      const result = await deleteExpense({ expenseId: row.id });
      if (result.success) {
        toast.success(copy.table.deleteSuccess);
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

      if (targetMethod === "transfer") {
        const transferContent = result.data?.transferContent;
        if (!transferContent) {
          toast.error(copy.transferInstruction.createFailed);
          return;
        }
        setTransferInstruction(transferContent);
        toast.success(copy.transferInstruction.created);
      } else if (targetMethod === "cash") {
        toast.success(copy.actions.cashSuccess);
      } else {
        toast.success(copy.actions.cancelTransferSuccess);
      }
      router.refresh();
    });
  }

  async function onPayCash(row: ExpenseRow) {
    const ok = await confirm({
      title: copy.actions.cashTitle,
      description: copy.actions.cashConfirm(formatVND(row.amount)),
      confirmText: copy.actions.cashCta,
      cancelText: copy.actions.keepUnpaid,
    });
    if (ok) runPaymentTransition(row, "cash");
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
          label: copy.actions.createTransfer,
          icon: <IconLandmark className="size-4" />,
          onSelect: () => runPaymentTransition(row, "transfer"),
          disabled: isMutating,
        },
        ...(canDeleteExpense(row)
          ? [
              {
                key: "delete",
                label: copy.table.delete,
                icon: <IconTrash className="size-4" />,
                onSelect: () => void onDelete(row),
                disabled: isMutating,
                destructive: true,
                separatorBefore: true,
              } satisfies RowActionItem,
            ]
          : []),
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
        {
          key: "cancel-transfer",
          label: copy.actions.cancelTransfer,
          icon: <IconRotateCcw className="size-4" />,
          onSelect: () => void onCancelTransfer(row),
          disabled: isMutating,
        },
      ];
    }

    return canDeleteExpense(row)
      ? [
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
      render: (row) =>
        (copy.categoryLabels as Record<string, string>)[row.category] ??
        row.category,
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
      render: (row) =>
        (copy.paymentMethodLabels as Record<string, string>)[
          expensePaymentMethod(row)
        ] ?? expensePaymentMethod(row),
    },
    {
      key: "payment_state",
      header: copy.table.paymentState,
      className: "w-32",
      render: (row) => (
        <StatusBadge
          domain="expense-payment"
          value={classifyExpensePaymentState(row)}
        />
      ),
    },
    {
      key: "amount",
      header: copy.table.amount,
      className: "text-right font-mono tabular-nums",
      render: (row) => formatVND(row.amount),
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
                <RowActionsMenu
                  items={items}
                  label={copy.table.actions}
                  triggerSize="icon-sm"
                />
              ) : null;
            },
          } satisfies DataTableColumn<ExpenseRow>,
        ]
      : []),
  ];

  return (
    <>
      <FilterBar
        params={params}
        branches={branches}
        basePath="/finance/expenses"
        hide={["compare", "granularity"]}
      />

      <KpiRow density="compact">
        <KpiCard
          label={copy.totalLabel}
          value={formatVND(totalAmount)}
          hint={copy.totalHint(formatCount(rows.length))}
          tone="primary"
          density="compact"
        />
      </KpiRow>

      <AppSection
        title={copy.listTitle}
        action={
          canManageExpenses ? (
            <Button
              size={isTouchLayout ? "touch" : "default"}
              onClick={() => setDialogOpen(true)}
            >
              <IconPlus data-icon="inline-start" />
              {copy.add}
            </Button>
          ) : null
        }
        contentFlush
        contentScroll
      >
        <DataTable
          columns={columns}
          data={rows}
          pageSize={50}
          getRowKey={(row) => row.id}
          emptyMode="no-data"
          emptyTitle={copy.empty.title}
          emptyDescription={copy.empty.description}
          mobileCardRender={(row) => {
            const detail = expenseDetail(row);
            const actionItems = getExpenseRowActions(row);
            return (
              <Item variant="outline">
                <ItemHeader>
                  <ItemContent>
                    <ItemTitle>
                      {(copy.categoryLabels as Record<string, string>)[
                        row.category
                      ] ?? row.category}
                    </ItemTitle>
                    <ItemDescription>
                      {formatVNBusinessDate(row.expense_date)} ·{" "}
                      {branchLabel(row.branch_id)} ·{" "}
                      {(copy.paymentMethodLabels as Record<string, string>)[
                        expensePaymentMethod(row)
                      ] ?? expensePaymentMethod(row)}
                    </ItemDescription>
                  </ItemContent>
                  {canManageExpenses && actionItems.length > 0 ? (
                    <ItemActions>
                      <RowActionsMenu
                        items={actionItems}
                        label={copy.table.actions}
                        triggerSize="icon-touch"
                      />
                    </ItemActions>
                  ) : null}
                </ItemHeader>
                <ItemFooter>
                  <ItemDescription>{detail || "—"}</ItemDescription>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge
                      domain="expense-payment"
                      value={classifyExpensePaymentState(row)}
                    />
                    <span className="font-mono text-sm font-semibold tabular-nums">
                      {formatVND(row.amount)}
                    </span>
                  </div>
                </ItemFooter>
              </Item>
            );
          }}
        />
      </AppSection>

      {canManageExpenses ? (
        <FormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title={copy.form.title}
          schema={expenseFormSchema}
          defaultValues={defaultValues}
          onSubmit={onSubmit}
          onSuccess={onCreateSuccess}
          submitLabel={copy.form.submit}
        >
          {(form) => (
            <>
              <BusinessDateField
                control={form.control}
                name="expenseDate"
                label={copy.form.date}
                required
              />
              <SelectField
                control={form.control}
                name="branchId"
                label={copy.form.branch}
                options={branchOptions}
                placeholder={copy.form.branchTenantLevel}
              />
              <SelectField
                control={form.control}
                name="category"
                label={copy.form.category}
                groups={CATEGORY_GROUPS}
                placeholder={copy.form.categoryPlaceholder}
                required
              />
              <MoneyVndField
                control={form.control}
                name="amount"
                label={copy.form.amount}
                required
              />
              <SelectField
                control={form.control}
                name="paymentMethod"
                label={copy.form.method}
                options={METHOD_OPTIONS}
                placeholder={copy.form.methodPlaceholder}
                description={
                  copy.form.methodHints[
                    form.watch("paymentMethod") as ExpensePaymentMethod
                  ]
                }
                required
              />
              <TextField
                control={form.control}
                name="vendorName"
                label={copy.form.vendor}
                placeholder={copy.form.vendorPlaceholder}
              />
              <TextareaField
                control={form.control}
                name="note"
                label={copy.form.note}
                placeholder={copy.form.notePlaceholder}
              />
            </>
          )}
        </FormDialog>
      ) : null}

      <AppDialog
        open={transferInstruction != null}
        onOpenChange={(open) => {
          if (!open) setTransferInstruction(null);
        }}
        title={copy.transferInstruction.title}
        description={copy.transferInstruction.description}
        footer={
          <Button
            variant="outline"
            size="touch"
            onClick={() => setTransferInstruction(null)}
          >
            {copy.transferInstruction.close}
          </Button>
        }
      >
        {transferInstruction ? (
          <Item variant="muted" className="flex-col items-stretch gap-3 p-4">
            <p className="text-sm font-medium text-muted-foreground">
              {copy.transferInstruction.codeLabel}
            </p>
            <code className="block break-all font-mono text-lg font-semibold tabular-nums tracking-wide">
              {transferInstruction}
            </code>
            <Button
              size="touch"
              className="w-full"
              onClick={() => void copyTransferContent(transferInstruction)}
            >
              <IconCopy data-icon="inline-start" />
              {copy.transferInstruction.copy}
            </Button>
          </Item>
        ) : null}
      </AppDialog>
    </>
  );
}
