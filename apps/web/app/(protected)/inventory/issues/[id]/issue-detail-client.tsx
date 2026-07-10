"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  CircleCheck as IconCircleCheck,
  CirclePlus as IconCirclePlus,
  Trash as IconTrash,
  X as IconX,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Field, FieldError, FieldLabel } from "@comtammatu/ui/components/field";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
} from "@comtammatu/ui/components/input-group";
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
  ItemGroup,
} from "@comtammatu/ui/components/item";
import {
  Combobox,
  FormattedNumberInput,
  FormDialog,
  TextareaField,
} from "@/components/form";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  AppBackLink,
  AppDetailFooter,
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
  DescriptionList,
} from "@/components/surface";
import { getStatusBadgeMeta } from "@/components/status-badge";
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
  clampIssueEntryQuantity,
  formatIssueMaxEntryQuantity,
  getDefaultIssueUnit,
  getIssueBaseQuantity,
  getIssueMaxEntryQuantity,
  getIssueUnitOptions,
} from "../../_lib/issue-units";
import type { IngredientRow } from "../../page";

import { ACTIONS_VI, BRANCH_VI, FORM_VI } from "@comtammatu/shared/messages";

const ISSUES_VI = messages.inventory.issues;
const stockCopy = messages.inventory.stock;
const inventoryCommon = messages.inventory.common;
const historySectionTitle = "Lịch sử chỉnh sửa";

type IssueIngredientRow = IngredientRow & {
  current_quantity?: number;
  avg_unit_cost?: number | null;
};

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
  entry_unit_id: number | null;
  unit_cost: number;
  total_cost: number;
  reason: string | null;
  ingredients: { id: number; name: string; unit: string } | null;
};

type AddIssueLineDialogProps = {
  ingredients: IssueIngredientRow[];
  isOpen: boolean;
  issueId: number;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
};

const addIssueLineSchema = z.object({
  ingredientId: z.string().min(1, { error: ISSUES_VI.lineIngredientRequired }),
  quantity: z
    .string()
    .min(1, { error: ISSUES_VI.lineQuantityRequired })
    .refine((value) => Number(value) > 0, {
      error: ISSUES_VI.lineQuantityPositive,
    }),
  entryUnitId: z.string().optional(),
  reason: z.string().trim().min(1, {
    error: ISSUES_VI.lineReasonRequired,
  }),
});

type AddIssueLineFormValues = z.infer<typeof addIssueLineSchema>;

function getWarehouseUnit(ingredient: IngredientRow) {
  return ingredient.units?.find((u) => u.is_base)?.unit_code || "";
}

function getIssueSurface(
  issueType: string,
  branchKind: string | null | undefined,
) {
  void branchKind;

  if (issueType === "writeoff") {
    return ISSUES_VI.surface.writeoff;
  }

  if (issueType === "consumption") {
    return ISSUES_VI.surface.consumption;
  }

  return ISSUES_VI.surface.other;
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
      : ISSUES_VI.hrmConsumptionSource;
  }

  return issue.source_type === "manual" || !issue.source_type
    ? ISSUES_VI.manualSource
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
  ingredients: IssueIngredientRow[];
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
  const issueBranchName =
    issue.branches?.name ?? ISSUES_VI.branchRef(issue.branch_id);
  const ingredientById = useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
    [ingredients],
  );
  const lineBaseQuantity = useCallback(
    (line: IssueLine) => {
      const issueUnit = getIssueUnitOptions(
        ingredientById.get(line.ingredient_id),
      ).find((option) => option.unitId === line.entry_unit_id);
      return Number(line.quantity ?? 0) * (issueUnit?.toBaseFactor ?? 1);
    },
    [ingredientById],
  );
  const lineAmount = useCallback(
    (line: IssueLine) => lineBaseQuantity(line) * Number(line.unit_cost ?? 0),
    [lineBaseQuantity],
  );

  const totalAmount = useMemo(
    () => lines.reduce((sum, line) => sum + lineAmount(line), 0),
    [lineAmount, lines],
  );

  async function reload() {
    const res = await fetchStockIssueDetail(issueId);
    if (!res.success || !res.data) {
      toast.error(ISSUES_VI.reloadFailed);
      return;
    }

    const data = res.data as { issue: IssueRecord; lines: IssueLine[] };
    setIssue(data.issue);
    setLines(data.lines);
    router.refresh();
  }

  async function handleDeleteLine(itemId: number) {
    const ok = await confirm({
      title: ISSUES_VI.deleteLineTitle,
      description: ISSUES_VI.deleteLineDescription,
      confirmText: ISSUES_VI.deleteLineAction,
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
        toast.error(res.error ?? ISSUES_VI.deleteLineFailed);
        return;
      }

      toast.success(ISSUES_VI.deleteLineOk);
      await reload();
    });
  }

  async function handleConfirmIssue() {
    const ok = await confirm({
      title: surface.confirmTitle,
      description: ISSUES_VI.confirmDescription(issue.branches?.name ?? "—"),
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
        toast.error(res.error ?? ISSUES_VI.confirmFailed);
        return;
      }

      toast.success(ISSUES_VI.confirmOk);
      await reload();
    });
  }

  async function handleCancelIssue() {
    const ok = await confirm({
      title: ISSUES_VI.cancelTitle,
      description: ISSUES_VI.cancelDescription,
      confirmText: ISSUES_VI.cancelConfirmAction,
      cancelText: ISSUES_VI.cancelKeepAction,
      variant: "destructive",
    });

    if (!ok) return;

    startTransition(async () => {
      const res = await cancelStockIssue(issueId);
      if (!res.success) {
        toast.error(res.error ?? ISSUES_VI.cancelFailed);
        return;
      }

      toast.success(ISSUES_VI.cancelOk);
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
      header: FORM_VI.quantity,
      className: "text-right font-semibold",
      render: (line) => formatQty(Number(line.quantity ?? 0)),
    },
    {
      key: "unit",
      header: FORM_VI.unit,
      render: (line) => (
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
          {line.unit ?? line.ingredients?.unit ?? ""}
        </span>
      ),
    },
    {
      key: "unitCost",
      header: ISSUES_VI.unitCostWac,
      className: "text-right font-medium",
      render: (line) => formatVND(Number(line.unit_cost ?? 0)),
    },
    {
      key: "total",
      header: FORM_VI.amount,
      className: "text-right font-bold",
      render: (line) => formatVND(lineAmount(line)),
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
            aria-label={ISSUES_VI.deleteLineAction}
          >
            <IconTrash className="size-4" />
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  const pageLayout = (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Left Column: Ingredients List Table + Audit History */}
        <div className="flex flex-col gap-4">
          <AppSection
            title={tTerm("ingredientsList")}
            description={
              isDraft
                ? ISSUES_VI.draftAutoSaveHint
                : ISSUES_VI.finalizedReadOnlyHint
            }
            action={
              isDraft ? (
                <Button
                  onClick={() => setAddDialogOpen(true)}
                  className="bg-success/10 text-success hover:bg-success/15 hover:text-success"
                >
                  <IconCirclePlus className="size-4" />
                  {ISSUES_VI.addLinePrefixed(
                    tTerm("ingredient", "button").toLowerCase(),
                  )}
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
                        ISSUES_VI.branchRef(issue.branch_id),
                    },
                  ]}
                  itemOptions={lines.map((line) => ({
                    ingredientId: line.ingredient_id,
                    name: line.ingredients?.name ?? `#${line.ingredient_id}`,
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
                    ? ISSUES_VI.emptyLinesDraftTitle
                    : ISSUES_VI.emptyLinesTitle(surface.label)
                }
                description={
                  isDraft
                    ? ISSUES_VI.emptyLinesDraftDescription(
                        surface.confirmAction.toLowerCase(),
                      )
                    : ISSUES_VI.emptyLinesFinalizedDescription
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
                    amount={lineAmount(item)}
                    onDelete={handleDeleteLine}
                  />
                )}
              />
            )}

            <Frame className="flex justify-end border-border/60 bg-muted/30 p-4">
              <div className="flex w-full max-w-sm flex-col gap-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {ISSUES_VI.totalLinesColon}
                  </span>
                  <span className="font-bold">
                    {String(lines.length).padStart(2, "0")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {ISSUES_VI.goodsSubtotalColon}
                  </span>
                  <span className="font-bold">{formatVND(totalAmount)}</span>
                </div>
                <div className="flex items-end justify-between border-t border-border pt-3">
                  <span className="text-sm font-bold">
                    {ISSUES_VI.grandTotalCaps}
                  </span>
                  <div className="text-right">
                    <span className="block font-mono text-xl font-semibold leading-none tabular-nums text-primary">
                      {messages.inventory.common.currency(
                        formatVND(totalAmount),
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </Frame>
          </AppSection>

          {/* Audit History (Collapsible) */}
          <AppSection
            title={historySectionTitle}
            collapsible={true}
            defaultOpen={false}
          >
            <AuditHistoryList logs={auditLogs} />
          </AppSection>
        </div>

        {/* Right Column: Metadata Overview + Notes */}
        <div className="flex flex-col gap-4">
          <AppSection title={ISSUES_VI.overviewTab}>
            <DescriptionList
              className="grid gap-3"
              descriptionClassName="font-semibold"
              items={[
                {
                  term: ISSUES_VI.businessKindLabel,
                  description: surface.label,
                },
                {
                  term: `${BRANCH_VI.long} xuất`,
                  description: issueBranchName,
                },
                {
                  term: ISSUES_VI.totalLines,
                  description: String(lines.length).padStart(2, "0"),
                },
                {
                  term: ISSUES_VI.sourceLabel,
                  description: getIssueSourceLabel(issue),
                },
                {
                  term: ISSUES_VI.totalValue,
                  description: (
                    <span className="text-primary font-bold">
                      {messages.inventory.common.currency(
                        formatVND(totalAmount),
                      )}
                    </span>
                  ),
                },
              ]}
            />
          </AppSection>

          {issue.notes ? (
            <AppSection title={surface.noteLabel} size="sm">
              <p className="line-clamp-3 break-words text-sm text-muted-foreground">
                {issue.notes}
              </p>
            </AppSection>
          ) : null}
        </div>
      </div>

      {isDraft ? (
        <AppDetailFooter
          leading={
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancelIssue}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
              disabled={isPending}
            >
              <IconX className="size-5" />
              {ISSUES_VI.cancelIssueAction}
            </Button>
          }
          trailing={
            <>
              <Button type="button" variant="secondary" disabled>
                {ISSUES_VI.draftAutoSaved}
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
            </>
          }
        />
      ) : null}
    </div>
  );

  const mobileLayout = (
    <div className="flex flex-col gap-4">
      {/* 1. Tổng quan xuất kho */}
      <AppSection title={ISSUES_VI.overviewTab} size="sm">
        <DescriptionList
          className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm"
          descriptionClassName="font-semibold text-right"
          items={[
            {
              term: ISSUES_VI.businessKindLabel,
              description: surface.label,
            },
            {
              term: `${BRANCH_VI.long} xuất`,
              description: issueBranchName,
            },
            {
              term: ISSUES_VI.totalLines,
              description: String(lines.length).padStart(2, "0"),
            },
            {
              term: ISSUES_VI.sourceLabel,
              description: getIssueSourceLabel(issue),
            },
            {
              term: ISSUES_VI.totalValue,
              description: (
                <span className="text-primary font-bold">
                  {messages.inventory.common.currency(formatVND(totalAmount))}
                </span>
              ),
            },
          ]}
        />
      </AppSection>

      {/* Ghi chú nếu có */}
      {issue.notes ? (
        <AppSection
          title={surface.noteLabel}
          size="sm"
          collapsible
          defaultOpen={false}
        >
          <p className="break-words text-sm text-muted-foreground">
            {issue.notes}
          </p>
        </AppSection>
      ) : null}

      {/* 2. Danh sách sản phẩm */}
      <AppSection
        title={tTerm("ingredientsList")}
        description={
          isDraft
            ? ISSUES_VI.draftAutoSaveHint
            : ISSUES_VI.finalizedReadOnlyHint
        }
        action={
          isDraft ? (
            <Button
              onClick={() => setAddDialogOpen(true)}
              size="touch"
              className="bg-success/10 text-success hover:bg-success/15 hover:text-success"
            >
              <IconCirclePlus className="size-4" />
              {ISSUES_VI.addLinePrefixed(
                tTerm("ingredient", "button").toLowerCase(),
              )}
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
                    ISSUES_VI.branchRef(issue.branch_id),
                },
              ]}
              itemOptions={lines.map((line) => ({
                ingredientId: line.ingredient_id,
                name: line.ingredients?.name ?? `#${line.ingredient_id}`,
                unit: line.unit ?? line.ingredients?.unit ?? "",
              }))}
            />
          ) : null
        }
        size="sm"
      >
        {lines.length === 0 ? (
          <AppEmptyState
            mode="no-data"
            title={
              isDraft
                ? ISSUES_VI.emptyLinesDraftTitle
                : ISSUES_VI.emptyLinesTitle(surface.label)
            }
            description={
              isDraft
                ? ISSUES_VI.emptyLinesDraftDescription(
                    surface.confirmAction.toLowerCase(),
                  )
                : ISSUES_VI.emptyLinesFinalizedDescription
            }
            compact
          />
        ) : (
          <ItemGroup className="gap-2 p-0 rounded-none border-0">
            {lines.map((item) => (
              <IssueLineMobileCard
                key={item.id}
                item={item}
                isDraft={isDraft}
                isPending={isPending}
                amount={lineAmount(item)}
                onDelete={handleDeleteLine}
              />
            ))}
          </ItemGroup>
        )}

        {lines.length > 0 && (
          <Item
            variant="outline"
            className="mt-4 flex-col items-stretch gap-2 p-3 text-sm bg-muted/30"
          >
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {ISSUES_VI.totalLinesColon}
              </span>
              <span className="font-bold">
                {String(lines.length).padStart(2, "0")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {ISSUES_VI.goodsSubtotalColon}
              </span>
              <span className="font-bold">{formatVND(totalAmount)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="font-bold">{ISSUES_VI.grandTotalCaps}</span>
              <span className="font-mono font-semibold text-primary">
                {messages.inventory.common.currency(formatVND(totalAmount))}
              </span>
            </div>
          </Item>
        )}
      </AppSection>

      {/* 3. Lịch sử */}
      <AppSection
        title={historySectionTitle}
        size="sm"
        collapsible
        defaultOpen={false}
      >
        <AuditHistoryList logs={auditLogs} />
      </AppSection>

      {/* 4. Action Footer */}
      {isDraft ? (
        <AppDetailFooter
          sticky
          leading={
            <Button
              type="button"
              variant="ghost"
              size="touch"
              onClick={handleCancelIssue}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
              disabled={isPending}
            >
              <IconX className="size-5" />
              {ISSUES_VI.cancelIssueAction}
            </Button>
          }
          trailing={
            <>
              <Button type="button" variant="secondary" size="touch" disabled>
                {ISSUES_VI.draftAutoSaved}
              </Button>
              <Button
                type="button"
                size="touch-lg"
                onClick={handleConfirmIssue}
                disabled={isPending || lines.length === 0}
                className="transition-transform hover:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <IconCircleCheck className="size-5" />
                {surface.confirmAction}
              </Button>
            </>
          }
        />
      ) : null}
    </div>
  );

  const content = (
    <>
      <div className="lg:hidden">{mobileLayout}</div>
      <div className="hidden lg:block">{pageLayout}</div>
    </>
  );

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        eyebrow={surface.eyebrow}
        title={issue.issue_number}
        description={ISSUES_VI.headerMeta(
          surface.label,
          issueBranchName,
          issue.issued_at ? formatDateTime(issue.issued_at) : "—",
        )}
        badge={{
          children: statusBadge.label,
          variant: statusBadge.variant,
        }}
        breadcrumb={
          <AppBackLink href={listBasePath}>
            {tRoute("/inventory/consumption")}
          </AppBackLink>
        }
      />
      {content}
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
      entryUnitId: values.entryUnitId ? Number(values.entryUnitId) : null,
      reason: values.reason.trim(),
    });

    if (!res.success) {
      return {
        success: false,
        error: res.error ?? ISSUES_VI.saveLineFailed,
      };
    }

    await onSaved();
    return { success: true };
  }

  return (
    <FormDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      title={ISSUES_VI.addLineTitle}
      schema={addIssueLineSchema}
      defaultValues={defaultValues}
      entityKey={`issue-line-${issueId}`}
      onSubmit={handleSubmit}
      successMessage={ISSUES_VI.saveLineOk}
      submitLabel={ISSUES_VI.saveLineAction}
      cancelLabel={ACTIONS_VI.cancel}
    >
      {(form) => {
        const ingredientError = form.formState.errors.ingredientId;
        const selectedIngredient = ingredients.find(
          (item) => item.id === Number(form.watch("ingredientId")),
        );
        const issueUnitOptions = getIssueUnitOptions(selectedIngredient);
        const entryUnitId = form.watch("entryUnitId");
        const selectedIssueUnit = issueUnitOptions.find(
          (option) => String(option.unitId) === entryUnitId,
        );
        const quantityValue = form.watch("quantity");
        const quantity = Number(quantityValue || 0);
        const quantityError = form.formState.errors.quantity;
        const baseQuantity = getIssueBaseQuantity(quantity, selectedIssueUnit);
        const wac = Number(
          selectedIngredient?.avg_unit_cost ??
            selectedIngredient?.unit_cost ??
            0,
        );
        const availableQuantity = Number(
          selectedIngredient?.current_quantity ?? 0,
        );
        const maxEntryQuantity = getIssueMaxEntryQuantity(
          availableQuantity,
          selectedIssueUnit,
        );
        const maxQuantityValue = formatIssueMaxEntryQuantity(maxEntryQuantity);
        const previewValue = baseQuantity * (Number.isFinite(wac) ? wac : 0);
        return (
          <>
            <Field data-invalid={!!ingredientError}>
              <FieldLabel>{ISSUES_VI.ingredientLabel}</FieldLabel>
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
                    "entryUnitId",
                    defaultUnit ? String(defaultUnit.unitId) : "",
                  );
                  const nextMaxEntryQuantity = getIssueMaxEntryQuantity(
                    Number(ingredient?.current_quantity ?? 0),
                    defaultUnit,
                  );
                  form.setValue(
                    "quantity",
                    clampIssueEntryQuantity(
                      form.watch("quantity"),
                      nextMaxEntryQuantity,
                    ),
                    { shouldValidate: true },
                  );
                }}
                options={ingredients
                  .filter((ingredient) => ingredient.is_active)
                  .map((ingredient) => ({
                    value: String(ingredient.id),
                    label: ingredient.name,
                    hint:
                      ingredient.units?.find((u) => u.is_base)?.unit_code ?? "",
                    keywords: [ingredient.sku ?? "", ingredient.category ?? ""],
                  }))}
                placeholder={ISSUES_VI.ingredientPlaceholder}
                searchPlaceholder={ISSUES_VI.ingredientSearchPlaceholder}
              />
              {ingredientError ? (
                <FieldError errors={[ingredientError]} />
              ) : null}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!quantityError}>
                <FieldLabel htmlFor="issue-line-quantity">
                  {ISSUES_VI.quantityLabel} *
                </FieldLabel>
                <InputGroup className="h-10">
                  <FormattedNumberInput
                    id="issue-line-quantity"
                    maxFractionDigits={3}
                    value={quantityValue}
                    onValueChange={(value) =>
                      form.setValue(
                        "quantity",
                        clampIssueEntryQuantity(value, maxEntryQuantity),
                        { shouldValidate: true },
                      )
                    }
                    placeholder="0"
                    className="h-full flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-1 dark:bg-transparent"
                  />
                  {maxQuantityValue ? (
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        type="button"
                        onClick={() =>
                          form.setValue("quantity", maxQuantityValue, {
                            shouldDirty: true,
                            shouldTouch: true,
                            shouldValidate: true,
                          })
                        }
                      >
                        {FORM_VI.max}
                      </InputGroupButton>
                    </InputGroupAddon>
                  ) : null}
                </InputGroup>
                {quantityError ? <FieldError errors={[quantityError]} /> : null}
              </Field>

              {issueUnitOptions.length > 0 ? (
                <Field>
                  <FieldLabel htmlFor="issue-line-unit">
                    {ISSUES_VI.unitLabel}
                  </FieldLabel>
                  <Select
                    value={entryUnitId ?? ""}
                    onValueChange={(value) => {
                      form.setValue("entryUnitId", value, {
                        shouldValidate: true,
                      });
                      const opt = issueUnitOptions.find(
                        (o) => String(o.unitId) === value,
                      );
                      if (!opt) form.setValue("entryUnitId", "");
                      const nextMaxEntryQuantity = getIssueMaxEntryQuantity(
                        availableQuantity,
                        opt,
                      );
                      form.setValue(
                        "quantity",
                        clampIssueEntryQuantity(
                          form.watch("quantity"),
                          nextMaxEntryQuantity,
                        ),
                        { shouldValidate: true },
                      );
                    }}
                  >
                    <SelectTrigger
                      id="issue-line-unit"
                      className="w-full"
                      aria-label={ISSUES_VI.unitLabel}
                    >
                      <SelectValue placeholder={ISSUES_VI.selectUnit} />
                    </SelectTrigger>
                    <SelectContent>
                      {issueUnitOptions.map((o) => (
                        <SelectItem key={o.unitId} value={String(o.unitId)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : (
                <Field>
                  <FieldLabel htmlFor="issue-line-unit-missing">
                    {ISSUES_VI.unitLabel}
                  </FieldLabel>
                  <Select disabled value="">
                    <SelectTrigger
                      id="issue-line-unit-missing"
                      className="w-full"
                    >
                      <SelectValue placeholder={ISSUES_VI.selectUnit} />
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                </Field>
              )}
            </div>

            <Frame className="border-border/60 bg-muted/30 p-3">
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {ISSUES_VI.unitCostWac}
                  </p>
                  <p className="font-mono font-semibold tabular-nums">
                    {wac > 0 ? formatVND(wac) : inventoryCommon.noValue}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {stockCopy.table.availableStock}
                  </p>
                  <p className="font-mono font-semibold tabular-nums">
                    {selectedIngredient
                      ? `${formatQty(availableQuantity)} ${getWarehouseUnit(selectedIngredient)}`
                      : inventoryCommon.noValue}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {FORM_VI.value}
                  </p>
                  <p className="font-mono font-semibold tabular-nums text-primary">
                    {previewValue > 0
                      ? formatVND(previewValue)
                      : inventoryCommon.noValue}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {ISSUES_VI.wacAutoHint}
              </p>
            </Frame>

            <TextareaField
              control={form.control}
              name="reason"
              label={ISSUES_VI.reasonLabel}
              rows={3}
              placeholder={ISSUES_VI.reasonPlaceholder}
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
  amount,
  onDelete,
}: {
  item: IssueLine;
  isDraft: boolean;
  isPending: boolean;
  amount: number;
  onDelete: (lineId: number) => void;
}) {
  return (
    <Item variant="outline" className="bg-muted/30">
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
              aria-label={ISSUES_VI.deleteLineAction}
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
            <p className="text-muted-foreground">{ISSUES_VI.unitCostWac}</p>
            <p className="font-semibold">
              {formatVND(Number(item.unit_cost ?? 0))}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">{FORM_VI.amount}</p>
            <p className="font-semibold text-primary">{formatVND(amount)}</p>
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
