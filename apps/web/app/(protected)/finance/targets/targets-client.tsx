"use client";

import { useMemo, useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
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
  formatAccountingVND as formatVND,
  formatPercent,
} from "@comtammatu/shared/format";
import {
  AppDialog,
  FormattedNumberInput,
  MoneyVndInput,
} from "@/components/form";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { AppEmptyState, AppListFrame, AppToolbar } from "@/components/surface";
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

export function RevenueTargetsClient({
  yearMonth,
  initialRows,
}: {
  yearMonth: string;
  initialRows: RevenueTargetSetupRow[];
}) {
  const [rows, setRows] = useState<EditableRow[]>(() =>
    initialRows.map((row) => ({
      ...row,
      draft:
        row.targetAmount == null ? "" : String(row.targetAmount),
      tierDrafts: row.rewardTiers.map((tier, index) =>
        toEditableRewardTier(tier, `${row.branchId}-${index}`),
      ),
    })),
  );
  const [pending, startTransition] = useTransition();
  const [editingBranchId, setEditingBranchId] = useState<number | null>(null);
  const editingRow =
    rows.find((row) => row.branchId === editingBranchId) ?? null;

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
              : previewTargetProgress(
                  row.currentNetRevenue,
                  row.targetAmount,
                );
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
        render: (row) => {
          const highest = [...row.tierDrafts]
            .map((tier) => Number(tier.thresholdPct))
            .filter(Number.isFinite)
            .sort((a, b) => b - a)[0];
          return (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {row.tierDrafts.length === 0
                  ? copy.rewardTiers.empty
                  : `${copy.rewardTiers.count(row.tierDrafts.length)}${
                      highest == null
                        ? ""
                        : ` · ${copy.rewardTiers.highest(formatPercent(highest, 2))}`
                    }`}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => openEditor(row.branchId)}
              >
                {row.tierDrafts.length === 0
                  ? copy.rewardTiers.configure
                  : copy.rewardTiers.edit}
              </Button>
            </div>
          );
        },
      },
      {
        key: "actions",
        header: "",
        className: "w-12",
        render: (row) => (
          <div
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <RowActionsMenu
              label={`${copy.branch} ${row.branchName}`}
              triggerSize="icon-sm"
              items={[
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
              ]}
            />
          </div>
        ),
      },
    ],
    [onDelete, openEditor, pending],
  );

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

  if (rows.length === 0) {
    return (
      <AppListFrame>
        <AppEmptyState mode="no-data" title={copy.empty} />
      </AppListFrame>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <AppToolbar>
          <Button
            type="button"
            onClick={() => {
              const row = rows.find((item) => item.targetAmount == null);
              if (row) openEditor(row.branchId);
              else toast.error(copy.allConfigured);
            }}
            disabled={pending || !rows.some((row) => row.targetAmount == null)}
          >
            <Plus />
            {copy.add}
          </Button>
        </AppToolbar>
        <DataTable
          data={rows}
          columns={columns}
          getRowKey={(row) => row.branchId}
          emptyTitle={copy.empty}
          emptyMode="no-data"
        />
      </div>

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
        description={copy.editor.description}
        contentClassName="sm:max-w-3xl"
        footer={
          <Button
            type="button"
            onClick={onSave}
            disabled={pending}
          >
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
