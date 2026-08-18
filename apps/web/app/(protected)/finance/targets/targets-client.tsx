"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { FORM_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { InteractiveCard } from "@comtammatu/ui/components/interactive-card";
import { Item } from "@comtammatu/ui/components/item";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
import {
  formatAccountingVND as formatVND,
  formatPercent,
} from "@comtammatu/shared/format";
import {
  AppDialog,
  BusinessDatePicker,
  FormattedNumberInput,
  MoneyVndInput,
} from "@/components/form";
import { confirm } from "@/components/confirm-dialog";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { AppEmptyState, AppListFrame, AppPageHeader, AppToolbar } from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { messages } from "@lib/messages";
import {
  deleteBranchRevenueTarget,
  upsertBranchRevenueTargets,
  type BranchRevenueTargetRow,
} from "./actions";
import {
  normalizeRevenueRewardTiers,
  previewTargetProgress,
  type RevenueRewardTier,
  type RevenueRewardType,
} from "../_lib/revenue-target";

const copy = messages.finance.revenueTargets;

type EditableRewardTier = {
  id: string;
  thresholdPct: string;
  rewardType: RevenueRewardType;
  rewardValue: string;
};

type RevenueTargetSetupRow = BranchRevenueTargetRow & {
  currentNetRevenue: number | null;
};

type EditableRow = BranchRevenueTargetRow & {
  draft: string;
  tierDrafts: EditableRewardTier[];
  currentNetRevenue: number | null;
};

function toEditableRewardTier(
  tier: RevenueRewardTier,
  id: string,
): EditableRewardTier {
  return {
    id,
    thresholdPct: String(tier.thresholdPct),
    rewardType: tier.rewardType,
    rewardValue: String(tier.rewardValue),
  };
}

function parseRewardTiers(
  tiers: EditableRewardTier[],
): RevenueRewardTier[] | null {
  return normalizeRevenueRewardTiers(
    tiers.map((tier) => ({
      thresholdPct: Number(tier.thresholdPct),
      rewardType: tier.rewardType,
      rewardValue: Number(tier.rewardValue),
    })),
  );
}

function rewardTierSummary(row: EditableRow): string {
  if (row.tierDrafts.length === 0) return copy.rewardTiers.empty;
  const highest = [...row.tierDrafts]
    .map((tier) => Number(tier.thresholdPct))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  return `${copy.rewardTiers.count(row.tierDrafts.length)}${
    highest == null
      ? ""
      : ` · ${copy.rewardTiers.highest(formatPercent(highest, 2))}`
  }`;
}

export function RevenueTargetsClient({
  yearMonth,
  initialRows,
}: {
  yearMonth: string;
  initialRows: RevenueTargetSetupRow[];
}) {
  const controlSize = useFormControlSize();
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const [rows, setRows] = useState<EditableRow[]>(() =>
    initialRows.map((row) => ({
      ...row,
      draft: row.targetAmount == null ? "" : String(row.targetAmount),
      tierDrafts: row.rewardTiers.map((tier, index) =>
        toEditableRewardTier(tier, `${row.branchId}-${index}`),
      ),
    })),
  );
  const [pending, startTransition] = useTransition();
  const [editingBranchId, setEditingBranchId] = useState<number | null>(null);
  const editingRow =
    rows.find((row) => row.branchId === editingBranchId) ?? null;
  const [selectedMonth, setSelectedMonth] = useState(yearMonth);
  const hasUnconfigured = rows.some((row) => row.targetAmount == null);

  useEffect(() => setSelectedMonth(yearMonth), [yearMonth]);

  function openEditor(branchId: number) {
    setEditingBranchId(branchId);
  }

  function patchRewardTier(
    branchId: number,
    tierId: string,
    patch: Partial<EditableRewardTier>,
  ) {
    setRows((current) =>
      current.map((row) =>
        row.branchId === branchId
          ? {
              ...row,
              tierDrafts: row.tierDrafts.map((tier) =>
                tier.id === tierId ? { ...tier, ...patch } : tier,
              ),
            }
          : row,
      ),
    );
  }

  function addRewardTier(branchId: number) {
    setRows((current) =>
      current.map((row) =>
        row.branchId === branchId && row.tierDrafts.length < 10
          ? {
              ...row,
              tierDrafts: [
                ...row.tierDrafts,
                {
                  id: crypto.randomUUID(),
                  thresholdPct: "",
                  rewardType: "fixed_amount",
                  rewardValue: "",
                },
              ],
            }
          : row,
      ),
    );
  }

  function removeRewardTier(branchId: number, tierId: string) {
    setRows((current) =>
      current.map((row) =>
        row.branchId === branchId
          ? {
              ...row,
              tierDrafts: row.tierDrafts.filter((tier) => tier.id !== tierId),
            }
          : row,
      ),
    );
  }

  async function onDelete(targetRow: EditableRow) {
    const ok = await confirm({
      title: copy.deleteTitle(targetRow.branchName),
      description: copy.deleteConfirm,
      confirmText: copy.delete,
      cancelText: copy.deleteCancel,
      variant: "destructive",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteBranchRevenueTarget({
        year_month: yearMonth,
        branch_id: targetRow.branchId,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(copy.deleted);
      setRows((current) =>
        current.map((row) => {
          if (row.branchId !== targetRow.branchId) return row;
          return {
            ...row,
            targetAmount: null,
            draft: "",
            rewardTiers: [],
            tierDrafts: [],
          };
        }),
      );
    });
  }

  function rowActions(row: EditableRow): RowActionItem[] {
    return [
      {
        key: row.targetAmount == null ? "add" : "edit",
        label: row.targetAmount == null ? copy.add : copy.edit,
        icon: row.targetAmount == null ? <Plus /> : <Pencil />,
        onSelect: () => openEditor(row.branchId),
      },
      ...(row.targetAmount == null
        ? []
        : [
            {
              key: "delete",
              label: copy.delete,
              icon: <Trash2 />,
              destructive: true,
              onSelect: () => void onDelete(row),
            },
          ]),
    ];
  }

  function onSave() {
    if (!editingRow) return;
    const amount = Number(editingRow.draft);
    const rewardTiers = parseRewardTiers(editingRow.tierDrafts);
    if (!Number.isFinite(amount) || amount <= 0 || !rewardTiers) {
      toast.error(copy.errors.invalidPayload);
      return;
    }

    startTransition(async () => {
      const result = await upsertBranchRevenueTargets({
        year_month: yearMonth,
        rows: [
          {
            branch_id: editingRow.branchId,
            target_amount: amount,
            reward_tiers: rewardTiers.map((tier) => ({
              threshold_pct: tier.thresholdPct,
              reward_type: tier.rewardType,
              reward_value: tier.rewardValue,
            })),
          },
        ],
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setRows((current) =>
        current.map((row) =>
          row.branchId === editingRow.branchId
            ? {
                ...row,
                targetAmount: amount,
                draft: String(amount),
                rewardTiers,
                tierDrafts: rewardTiers.map((tier, index) =>
                  toEditableRewardTier(tier, `${row.branchId}-${index}`),
                ),
              }
            : row,
        ),
      );
      setEditingBranchId(null);
      toast.success(
        editingRow.targetAmount == null ? copy.added : copy.updated,
      );
    });
  }

  const columns = useMemo<DataTableColumn<EditableRow>[]>(
    () => [
      {
        key: "branch",
        header: copy.branch,
        render: (row) => row.branchName,
      },
      {
        key: "prior",
        header: copy.priorMonth,
        className: "text-right",
        render: (row) => (
          <span className="font-mono tabular-nums">
            {formatVND(row.priorMonthNetRevenue)}
          </span>
        ),
      },
      {
        key: "current",
        header: copy.currentMonth,
        className: "text-right",
        render: (row) => (
          <span className="font-mono tabular-nums">
            {row.currentNetRevenue == null
              ? copy.progress.unavailable
              : formatVND(row.currentNetRevenue)}
          </span>
        ),
      },
      {
        key: "target",
        header: copy.target,
        className: "text-right",
        render: (row) => {
          const preview =
            row.targetAmount == null
              ? null
              : previewTargetProgress(row.currentNetRevenue, row.targetAmount);
          return (
            <div>
              <span className="font-mono tabular-nums">
                {row.targetAmount == null
                  ? copy.progress.noTarget
                  : formatVND(row.targetAmount)}
              </span>
              {preview != null ? (
                <span className="mt-1 block text-right text-xs text-muted-foreground tabular-nums">
                  {formatPercent(preview.progressPct)}
                  {preview.gapAmount > 0
                    ? ` · ${copy.progress.remaining(formatVND(preview.gapAmount))}`
                    : null}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "rewardTiers",
        header: copy.rewardTiers.column,
        render: (row) => (
          <span className="text-xs text-muted-foreground">
            {rewardTierSummary(row)}
          </span>
        ),
      },
      {
        key: "actions",
        header: <span className="sr-only">{FORM_VI.action}</span>,
        className: "w-12",
        render: (row) => (
          <div
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <RowActionsMenu
              label={`${FORM_VI.action} ${row.branchName}`}
              triggerSize="icon-sm"
              items={rowActions(row)}
            />
          </div>
        ),
      },
    ],
    [pending],
  );

  function openAddTarget() {
    const row = rows.find((item) => item.targetAmount == null);
    if (row) openEditor(row.branchId);
    else toast.error(copy.allConfigured);
  }

  const toolbar = (
    <form method="get">
      <AppToolbar
        variant="inline"
        filters={
          <>
            <BusinessDatePicker
              id="revenue-target-month"
              value={selectedMonth}
              displayValue={`Tháng ${Number(selectedMonth.slice(5, 7))}/${selectedMonth.slice(0, 4)}`}
              aria-label={copy.monthLabel}
              captionLayout="dropdown"
              className="w-full sm:w-48"
              onValueChange={(value) =>
                value && setSelectedMonth(`${value.slice(0, 7)}-01`)
              }
            />
            <input
              type="hidden"
              name="month"
              value={selectedMonth.slice(0, 7)}
            />
          </>
        }
        actions={
          <Button type="submit" variant="outline" size={controlSize}>
            {copy.applyMonth}
          </Button>
        }
      />
    </form>
  );

  return (
    <>
      <AppPageHeader
        title={copy.page.title}
        actions={
          <Button
            type="button"
            size={isTouchLayout ? "touch" : "default"}
            disabled={pending || !hasUnconfigured}
            onClick={openAddTarget}
          >
            <Plus data-icon="inline-start" />
            {copy.add}
          </Button>
        }
      />

      <AppListFrame toolbar={toolbar}>
        {rows.length === 0 ? (
          <AppEmptyState mode="no-data" title={copy.empty} />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            getRowKey={(row) => row.branchId}
            emptyTitle={copy.empty}
            emptyMode="no-data"
            onRowClick={(row) => openEditor(row.branchId)}
            renderRowContextMenu={(row) => (
              <RowActionsContextMenuItems items={rowActions(row)} />
            )}
            mobileCardRender={(row) => (
              <InteractiveCard
                minHeight="mobile"
                padding="default"
                role="button"
                tabIndex={0}
                className="cursor-pointer touch-manipulation justify-between"
                onClick={() => openEditor(row.branchId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openEditor(row.branchId);
                  }
                }}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate text-sm font-medium">
                    {row.branchName}
                  </p>
                  <p className="font-mono text-sm tabular-nums">
                    {row.targetAmount == null
                      ? copy.progress.noTarget
                      : formatVND(row.targetAmount)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {copy.currentMonth}:{" "}
                    <span className="font-mono tabular-nums">
                      {row.currentNetRevenue == null
                        ? copy.progress.unavailable
                        : formatVND(row.currentNetRevenue)}
                    </span>
                    {" · "}
                    {copy.priorMonth}:{" "}
                    <span className="font-mono tabular-nums">
                      {formatVND(row.priorMonthNetRevenue)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {rewardTierSummary(row)}
                  </p>
                </div>
                <div
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <RowActionsMenu
                    items={rowActions(row)}
                    label={`${FORM_VI.action} ${row.branchName}`}
                    triggerSize={isTouchLayout ? "icon-touch" : "icon"}
                  />
                </div>
              </InteractiveCard>
            )}
          />
        )}
      </AppListFrame>

      <AppDialog
        open={editingRow != null}
        onOpenChange={(open) => {
          if (!open) setEditingBranchId(null);
        }}
        title={
          editingRow
            ? editingRow.targetAmount == null
              ? copy.editor.addTitle(editingRow.branchName)
              : copy.editor.editTitle(editingRow.branchName)
            : copy.editor.editTitle("")
        }
        contentClassName="sm:max-w-3xl"
        footer={
          <Button type="button" onClick={onSave} disabled={pending}>
            {pending ? copy.saving : copy.editor.save}
          </Button>
        }
      >
        {editingRow ? (
          <>
            <Field>
              <FieldLabel htmlFor="revenue-target-amount">
                {copy.editor.targetLabel}
              </FieldLabel>
              <MoneyVndInput
                id="revenue-target-amount"
                value={editingRow.draft}
                onValueChange={(value) =>
                  setRows((current) =>
                    current.map((row) =>
                      row.branchId === editingRow.branchId
                        ? { ...row, draft: value }
                        : row,
                    ),
                  )
                }
                controlSize="field"
                disabled={pending}
              />
            </Field>
            <div className="border-t pt-4">
              <p className="text-sm font-medium">{copy.rewardTiers.column}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {copy.rewardTiers.description}
              </p>
            </div>
            <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
              {editingRow.tierDrafts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {copy.rewardTiers.empty}
                </p>
              ) : null}
              {editingRow.tierDrafts.map((tier) => {
                const thresholdId = `reward-threshold-${tier.id}`;
                const typeId = `reward-type-${tier.id}`;
                const valueId = `reward-value-${tier.id}`;
                return (
                  <Item
                    key={tier.id}
                    variant="outline"
                    className="grid gap-3 sm:grid-cols-[1fr_1.4fr_1.4fr_auto] sm:items-end"
                  >
                    <Field>
                      <FieldLabel htmlFor={thresholdId}>
                        {copy.rewardTiers.threshold}
                      </FieldLabel>
                      <FormattedNumberInput
                        id={thresholdId}
                        value={tier.thresholdPct}
                        onValueChange={(value) =>
                          patchRewardTier(editingRow.branchId, tier.id, {
                            thresholdPct: value,
                          })
                        }
                        maxFractionDigits={2}
                        controlSize="field"
                        disabled={pending}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={typeId}>
                        {copy.rewardTiers.rewardType}
                      </FieldLabel>
                      <Select
                        value={tier.rewardType}
                        onValueChange={(value) =>
                          patchRewardTier(editingRow.branchId, tier.id, {
                            rewardType: value as RevenueRewardType,
                          })
                        }
                        disabled={pending}
                      >
                        <SelectTrigger id={typeId} size="field">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed_amount">
                            {copy.rewardTiers.fixedAmount}
                          </SelectItem>
                          <SelectItem value="revenue_percent">
                            {copy.rewardTiers.revenuePercent}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={valueId}>
                        {copy.rewardTiers.rewardValue}
                      </FieldLabel>
                      {tier.rewardType === "fixed_amount" ? (
                        <MoneyVndInput
                          id={valueId}
                          value={tier.rewardValue}
                          onValueChange={(value) =>
                            patchRewardTier(editingRow.branchId, tier.id, {
                              rewardValue: value,
                            })
                          }
                          controlSize="field"
                          disabled={pending}
                        />
                      ) : (
                        <FormattedNumberInput
                          id={valueId}
                          value={tier.rewardValue}
                          onValueChange={(value) =>
                            patchRewardTier(editingRow.branchId, tier.id, {
                              rewardValue: value,
                            })
                          }
                          maxFractionDigits={2}
                          controlSize="field"
                          disabled={pending}
                        />
                      )}
                      <FieldDescription>
                        {tier.rewardType === "fixed_amount"
                          ? copy.rewardTiers.fixedAmountHint
                          : copy.rewardTiers.revenuePercentHint}
                      </FieldDescription>
                    </Field>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        removeRewardTier(editingRow.branchId, tier.id)
                      }
                      disabled={pending}
                    >
                      {copy.rewardTiers.remove}
                    </Button>
                  </Item>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => addRewardTier(editingRow.branchId)}
                disabled={pending || editingRow.tierDrafts.length >= 10}
              >
                {copy.rewardTiers.add}
              </Button>
              {editingRow.tierDrafts.length >= 10 ? (
                <span className="text-xs text-muted-foreground">
                  {copy.rewardTiers.maxReached}
                </span>
              ) : null}
            </div>
          </>
        ) : null}
      </AppDialog>
    </>
  );
}
