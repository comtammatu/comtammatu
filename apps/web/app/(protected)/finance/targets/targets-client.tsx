"use client";

import { useMemo, useState, useTransition } from "react";
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
import { AppEmptyState, AppListFrame, AppToolbar } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { messages } from "@lib/messages";
import {
  upsertBranchRevenueTargets,
  type BranchRevenueTargetRow,
} from "./actions";
import {
  normalizeRevenueRewardTiers,
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

type EditableRow = BranchRevenueTargetRow & {
  draft: string;
  tierDrafts: EditableRewardTier[];
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
  initialRows: BranchRevenueTargetRow[];
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
        key: "target",
        header: copy.target,
        className: "text-right",
        render: (row) => (
          <MoneyVndInput
            className="ml-auto max-w-40 text-right font-mono tabular-nums"
            value={row.draft}
            disabled={pending}
            controlSize="field"
            onValueChange={(value) => {
              setRows((current) =>
                current.map((item) =>
                  item.branchId === row.branchId
                    ? { ...item, draft: value }
                    : item,
                ),
              );
            }}
            aria-label={`${copy.target} ${row.branchName}`}
          />
        ),
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
                onClick={() => setEditingBranchId(row.branchId)}
              >
                {row.tierDrafts.length === 0
                  ? copy.rewardTiers.configure
                  : copy.rewardTiers.edit}
              </Button>
            </div>
          );
        },
      },
    ],
    [pending],
  );

  function onSave() {
    const payload: Array<{
      branch_id: number;
      target_amount: number;
      reward_tiers: Array<{
        threshold_pct: number;
        reward_type: RevenueRewardType;
        reward_value: number;
      }>;
    }> = [];

    for (const row of rows) {
      if (!row.draft.trim() && row.tierDrafts.length === 0) continue;
      const amount = Number(row.draft);
      const rewardTiers = parseRewardTiers(row.tierDrafts);
      if (!Number.isFinite(amount) || amount <= 0 || !rewardTiers) {
        toast.error(copy.errors.invalidPayload);
        return;
      }
      payload.push({
        branch_id: row.branchId,
        target_amount: amount,
        reward_tiers: rewardTiers.map((tier) => ({
          threshold_pct: tier.thresholdPct,
          reward_type: tier.rewardType,
          reward_value: tier.rewardValue,
        })),
      });
    }

    if (payload.length === 0) {
      toast.error(copy.errors.invalidPayload);
      return;
    }

    startTransition(async () => {
      const result = await upsertBranchRevenueTargets({
        year_month: yearMonth,
        rows: payload,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(copy.saved(String(result.data?.updated ?? payload.length)));
      setRows((current) =>
        current.map((row) => {
          const saved = payload.find((item) => item.branch_id === row.branchId);
          if (!saved) return row;
          return {
            ...row,
            targetAmount: saved.target_amount,
            draft: String(saved.target_amount),
            rewardTiers: saved.reward_tiers.map((tier) => ({
              thresholdPct: tier.threshold_pct,
              rewardType: tier.reward_type,
              rewardValue: tier.reward_value,
            })),
            tierDrafts: saved.reward_tiers.map((tier, index) =>
              toEditableRewardTier(
                {
                  thresholdPct: tier.threshold_pct,
                  rewardType: tier.reward_type,
                  rewardValue: tier.reward_value,
                },
                `${row.branchId}-${index}`,
              ),
            ),
          };
        }),
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
          <Button type="button" onClick={onSave} disabled={pending}>
            {pending ? copy.saving : copy.save}
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
            ? copy.rewardTiers.title(editingRow.branchName)
            : copy.rewardTiers.column
        }
        description={copy.rewardTiers.description}
        contentClassName="sm:max-w-3xl"
        footer={
          <Button
            type="button"
            onClick={() => setEditingBranchId(null)}
            disabled={pending}
          >
            {copy.rewardTiers.done}
          </Button>
        }
      >
        {editingRow ? (
          <>
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
