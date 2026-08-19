/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useEffect, useState, useTransition } from "react";
import type { TransitionStartFunction } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  CircleCheck as IconCircleCheck,
  CirclePlus as IconCirclePlus,
  FileText as IconFileText,
  Pencil as IconPencil,
  Trash as IconTrash,
  X as IconX,
} from "lucide-react";
import { ACTIONS_VI, FORM_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@/components/confirm-dialog";
import { Field, FieldGroup, FieldLabel } from "@comtammatu/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";

import { toast } from "@comtammatu/ui/components/sonner";
import { Combobox, QuantityInput } from "@/components/form";
import {
  AppDetailFooter,
  AppEmptyState,
  AppSheet,
} from "@/components/surface";
import { StatusBadge, getStatusBadgeMeta } from "@/components/status-badge";
import { PhotoUploadInput } from "@/components/form";
import {
  BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME,
  BranchOperatorControlBar,
  BranchOperatorDetailList,
  BranchOperatorPage,
  BranchOperatorPanel,
  BranchOperatorStatusStrip,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  canConfirmBranchStockIssue,
  type BranchStockIssueDetail,
  type BranchStockIssueIngredient,
  type BranchStockIssueLine,
  type BranchStockIssueType,
} from "@lib/inventory/stock-issue-model";
import { messages } from "@lib/messages";
import {
  clampIssueEntryQuantity,
  formatIssueMaxEntryQuantity,
  getDefaultIssueUnit,
  getIssueBaseQuantity,
  getIssueMaxEntryQuantity,
  getIssueUnitOptions,
} from "@/(protected)/inventory/_lib/issue-units";
import { formatQty } from "@lib/inventory/format";
import { applyInventoryActionError } from "@lib/inventory/apply-inventory-action-error";
import {
  cancelStockIssue,
  confirmStockIssue,
  deleteStockIssueLine,
  upsertStockIssueLine,
} from "@/(protected)/inventory/issue-actions";

const issuesCopy = messages.inventory.issues;

function issueTypeLabel(type: BranchStockIssueType) {
  return issuesCopy.surface[type].label;
}

function issueSurface(type: BranchStockIssueType) {
  return issuesCopy.surface[type];
}

type BranchStockIssueLineSheetProps = {
  open: boolean;
  issueId: number;
  tenantId: number;
  showConsumptionPhoto: boolean;
  line: BranchStockIssueLine | null;
  ingredients: BranchStockIssueIngredient[];
  isPending: boolean;
  startTransition: TransitionStartFunction;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

function BranchStockIssueLineSheet({
  open,
  issueId,
  tenantId,
  showConsumptionPhoto,
  line,
  ingredients,
  isPending,
  startTransition,
  onOpenChange,
  onSaved,
}: BranchStockIssueLineSheetProps) {
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [entryUnitId, setEntryUnitId] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const ingredient = line
      ? ingredients.find((item) => item.id === line.ingredientId)
      : undefined;
    const defaultUnit = getDefaultIssueUnit(ingredient);
    setIngredientId(line ? String(line.ingredientId) : "");
    setQuantity(line ? String(line.quantity) : "");
    setEntryUnitId(
      line?.entryUnitId != null
        ? String(line.entryUnitId)
        : defaultUnit
          ? String(defaultUnit.unitId)
          : "",
    );
    setPhotoUrl(line?.photoUrls[0] ?? null);
  }, [ingredients, line, open]);

  const selectedIngredient = ingredients.find(
    (ingredient) => ingredient.id === Number(ingredientId),
  );
  const unitOptions = getIssueUnitOptions(selectedIngredient);
  const selectedUnit = unitOptions.find(
    (option) => String(option.unitId) === entryUnitId,
  );
  const maxEntryQuantity = getIssueMaxEntryQuantity(
    selectedIngredient?.currentQuantity ?? 0,
    selectedUnit,
  );
  const maxQuantityValue = formatIssueMaxEntryQuantity(maxEntryQuantity);

  function handleIngredientChange(value: string) {
    const ingredient = ingredients.find((item) => item.id === Number(value));
    const defaultUnit = getDefaultIssueUnit(ingredient);
    setIngredientId(value);
    setEntryUnitId(defaultUnit ? String(defaultUnit.unitId) : "");
    setQuantity("");
  }

  function handleSave() {
    const parsedQuantity = Number(quantity);
    if (!selectedIngredient) {
      toast.error(issuesCopy.lineIngredientRequired);
      return;
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      toast.error(issuesCopy.lineQuantityPositive);
      return;
    }
    if (!selectedUnit) {
      toast.error(issuesCopy.lineUnitRequired);
      return;
    }
    if (
      getIssueBaseQuantity(parsedQuantity, selectedUnit) >
      selectedIngredient.currentQuantity + 1e-9
    ) {
      toast.error("Số lượng vượt tồn hiện tại.");
      return;
    }

    startTransition(async () => {
      const result = await upsertStockIssueLine({
        issueId,
        ingredientId: selectedIngredient.id,
        quantity: parsedQuantity,
        entryUnitId: selectedUnit.unitId,
        reason: line?.reason?.trim() || undefined,
        ...(showConsumptionPhoto
          ? { photoUrls: photoUrl ? [photoUrl] : [] }
          : {}),
      });
      if (!result.success) {
        toast.error(result.error ?? issuesCopy.saveLineFailed);
        return;
      }

      toast.success(issuesCopy.saveLineOk);
      onSaved();
      onOpenChange(false);
    });
  }

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title={line ? ACTIONS_VI.edit : issuesCopy.addLineTitle}
      description={line ? line.ingredientName : issuesCopy.addLineTitle}
      side="bottom"
      contentClassName="max-h-dvh-95 bg-background text-foreground"
      footer={
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="touch-lg"
            className="flex-1"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {ACTIONS_VI.cancel}
          </Button>
          <Button
            type="button"
            size="touch-lg"
            className="flex-1"
            disabled={isPending}
            onClick={handleSave}
          >
            {issuesCopy.saveLineAction}
          </Button>
        </div>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel>{issuesCopy.ingredientLabel}</FieldLabel>
          <Combobox
            value={ingredientId}
            onValueChange={handleIngredientChange}
            options={ingredients
              .filter(
                (ingredient) =>
                  ingredient.isActive || ingredient.id === line?.ingredientId,
              )
              .map((ingredient) => ({
                value: String(ingredient.id),
                label: ingredient.name,
                hint:
                  ingredient.units.find((unit) => unit.is_base)?.unit_code ??
                  "",
                keywords: [ingredient.sku ?? "", ingredient.category ?? ""],
              }))}
            placeholder={issuesCopy.ingredientPlaceholder}
            searchPlaceholder={issuesCopy.ingredientSearchPlaceholder}
            size="touch"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="branch-stock-issue-quantity">
              {issuesCopy.quantityLabel}
            </FieldLabel>
            <InputGroup className="min-h-12">
              <QuantityInput
                id="branch-stock-issue-quantity"
                maxFractionDigits={3}
                value={quantity}
                onValueChange={(value) =>
                  setQuantity(clampIssueEntryQuantity(value, maxEntryQuantity))
                }
                placeholder="0"
                className="h-full"
              />
              {maxQuantityValue ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    type="button"
                    onClick={() => setQuantity(maxQuantityValue)}
                  >
                    {FORM_VI.max}
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
            {selectedIngredient ? (
              <p className="text-xs text-muted-foreground">
                Tồn hiện có: {formatQty(selectedIngredient.currentQuantity)}
              </p>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="branch-stock-issue-unit">
              {issuesCopy.unitLabel}
            </FieldLabel>
            <Select value={entryUnitId} onValueChange={setEntryUnitId}>
              <SelectTrigger
                id="branch-stock-issue-unit"
                size="touch"
                className="w-full"
              >
                <SelectValue placeholder={issuesCopy.selectUnit} />
              </SelectTrigger>
              <SelectContent>
                {unitOptions.map((option) => (
                  <SelectItem
                    key={option.unitId}
                    value={String(option.unitId)}
                    size="touch"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {showConsumptionPhoto ? (
          <Field>
            <FieldLabel>{issuesCopy.evidencePhotoLabel}</FieldLabel>
            <PhotoUploadInput
              tenantId={tenantId}
              folder={`stock-issues/${issueId}/consumption`}
              value={photoUrl}
              onChange={setPhotoUrl}
              acceptTypes="image"
              disabled={isPending}
            />
          </Field>
        ) : null}
      </FieldGroup>
    </AppSheet>
  );
}

export function BranchStockIssueDetailClient({
  data,
  stockBasePath,
  listBasePath = `${stockBasePath}/issues`,
}: {
  data: BranchStockIssueDetail;
  stockBasePath: string;
  listBasePath?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [issue, setIssue] = useState(data.issue);
  const [lines, setLines] = useState(data.lines);
  const [lineSheetOpen, setLineSheetOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<BranchStockIssueLine | null>(
    null,
  );
  const issuesBasePath = listBasePath;
  const surface = issueSurface(issue.type);
  const statusBadge = getStatusBadgeMeta("inventory", issue.status);
  const isDraft = issue.status === "draft";
  const canEdit = isDraft && data.canManage;
  const canConfirm = canConfirmBranchStockIssue({
    issue,
    lines,
    canManage: data.canManage,
  });

  useEffect(() => {
    setIssue(data.issue);
    setLines(data.lines);
  }, [data.issue, data.lines]);

  function openNewLine() {
    setEditingLine(null);
    setLineSheetOpen(true);
  }

  function openEditLine(line: BranchStockIssueLine) {
    setEditingLine(line);
    setLineSheetOpen(true);
  }

  async function handleDeleteLine(line: BranchStockIssueLine) {
    const approved = await confirm({
      title: issuesCopy.deleteLineTitle,
      description: issuesCopy.deleteLineDescription,
      confirmText: issuesCopy.deleteLineAction,
      cancelText: ACTIONS_VI.back,
      variant: "destructive",
    });
    if (!approved) return;

    startTransition(async () => {
      const result = await deleteStockIssueLine({
        issueId: issue.id,
        itemId: line.id,
      });
      if (!result.success) {
        toast.error(result.error ?? issuesCopy.deleteLineFailed);
        return;
      }

      toast.success(issuesCopy.deleteLineOk);
      router.refresh();
    });
  }

  async function handleConfirm() {
    if (!canConfirm) return;

    const approved = await confirm({
      title: surface.confirmTitle,
      description: issuesCopy.confirmDescription(
        issuesCopy.branchRef(issue.branchId),
      ),
      confirmText: surface.confirmAction,
      cancelText: ACTIONS_VI.back,
    });
    if (!approved) return;

    startTransition(async () => {
      const result = await confirmStockIssue(issue.id);
      if (!result.success) {
        toast.error(
          applyInventoryActionError(result, issuesCopy.confirmFailed)
            .toastMessage,
        );
        return;
      }

      toast.success(issuesCopy.confirmOk);
      router.refresh();
    });
  }

  async function handleCancel() {
    const approved = await confirm({
      title: issuesCopy.cancelTitle,
      description: issuesCopy.cancelDescription,
      confirmText: issuesCopy.cancelConfirmAction,
      cancelText: issuesCopy.cancelKeepAction,
      variant: "destructive",
    });
    if (!approved) return;

    startTransition(async () => {
      const result = await cancelStockIssue(issue.id);
      if (!result.success) {
        toast.error(result.error ?? issuesCopy.cancelFailed);
        return;
      }

      toast.success(issuesCopy.cancelOk);
      router.refresh();
    });
  }

  return (
    <BranchOperatorPage
      title={issue.code}
      description={formatVNDateTime(issue.issuedAt)}
      hideHeaderOnMobile
      badge={{ children: statusBadge.label, variant: statusBadge.variant }}
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <BranchOperatorControlBar className="sm:hidden">
          <Button
            variant="ghost"
            size="icon-touch"
            title={ACTIONS_VI.back}
            render={<Link href={issuesBasePath} aria-label={ACTIONS_VI.back} />}
          >
            <IconArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-semibold">
              {issue.code}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {issueTypeLabel(issue.type)}
            </p>
          </div>
          <StatusBadge domain="inventory" value={issue.status} size="sm" />
        </BranchOperatorControlBar>

        <div className={BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME}>
          <BranchOperatorPanel
            title={issuesCopy.linesTab}
            description={
              isDraft
                ? issuesCopy.draftAutoSaveHint
                : issuesCopy.finalizedReadOnlyHint
            }
            icon={IconFileText}
            size="sm"
            contentClassName="gap-3"
          >
            {canEdit ? (
              <Button
                type="button"
                size="touch"
                className="w-full"
                onClick={openNewLine}
              >
                <IconCirclePlus data-icon="inline-start" />
                {issuesCopy.addLinePrefixed("nguyên liệu")}
              </Button>
            ) : null}
            {lines.length === 0 ? (
              <AppEmptyState
                compact
                mode="no-data"
                icon={<IconFileText />}
                title={
                  isDraft
                    ? issuesCopy.emptyLinesDraftTitle
                    : issuesCopy.emptyLinesTitle(issueTypeLabel(issue.type))
                }
                description={
                  isDraft
                    ? issuesCopy.emptyLinesDraftDescription(
                        surface.confirmAction.toLowerCase(),
                      )
                    : issuesCopy.emptyLinesFinalizedDescription
                }
              />
            ) : (
              <ItemGroup className="gap-2" role="list">
                {lines.map((line) => (
                  <div key={line.id} role="listitem">
                    <Item
                      variant="outline"
                      className="min-h-20 flex-col items-stretch gap-2 touch-manipulation"
                    >
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <ItemContent className="min-w-0 gap-1">
                          <ItemTitle className="line-clamp-none text-sm font-semibold">
                            {line.ingredientName}
                          </ItemTitle>
                          {line.reason?.trim() ? (
                            <ItemDescription className="line-clamp-none text-xs">
                              {line.reason.trim()}
                            </ItemDescription>
                          ) : null}
                        </ItemContent>
                        <ItemActions className="shrink-0">
                          <Badge
                            variant="outline"
                            className="font-mono tabular-nums"
                          >
                            {formatQty(line.quantity)} {line.unit}
                          </Badge>
                          {canEdit ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon-touch"
                                title={ACTIONS_VI.edit}
                                aria-label={`${ACTIONS_VI.edit} ${line.ingredientName}`}
                                disabled={isPending}
                                onClick={() => openEditLine(line)}
                              >
                                <IconPencil />
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon-touch"
                                title={issuesCopy.deleteLineAction}
                                aria-label={`${issuesCopy.deleteLineAction} ${line.ingredientName}`}
                                disabled={isPending}
                                onClick={() => void handleDeleteLine(line)}
                              >
                                <IconTrash />
                              </Button>
                            </>
                          ) : null}
                        </ItemActions>
                      </div>
                    </Item>
                  </div>
                ))}
              </ItemGroup>
            )}
          </BranchOperatorPanel>

          <BranchOperatorPanel title={issuesCopy.overviewTab} size="sm">
            <BranchOperatorStatusStrip
              items={[
                { label: FORM_VI.status, value: statusBadge.label },
                {
                  label: issuesCopy.businessKindLabel,
                  value: issueTypeLabel(issue.type),
                },
                {
                  label: issuesCopy.totalLines,
                  value: String(lines.length),
                  mono: true,
                },
              ]}
            />
            <BranchOperatorDetailList
              columns={1}
              className="mt-3"
              rows={[
                {
                  label: INVENTORY_VI.createdDate,
                  value: formatVNDateTime(issue.issuedAt),
                },
                ...(issue.notes
                  ? [
                      {
                        label: FORM_VI.notes,
                        value: issue.notes,
                      },
                    ]
                  : []),
              ]}
            />
          </BranchOperatorPanel>
        </div>

        {canEdit ? (
          <AppDetailFooter
            sticky
            leading={
              <Button
                type="button"
                variant="outline"
                size="touch"
                disabled={isPending}
                onClick={() => void handleCancel()}
              >
                <IconX data-icon="inline-start" />
                {issuesCopy.cancelIssueAction}
              </Button>
            }
            trailing={
              <Button
                type="button"
                size="touch-lg"
                disabled={isPending || !canConfirm}
                onClick={() => void handleConfirm()}
              >
                <IconCircleCheck data-icon="inline-start" />
                {surface.confirmAction}
              </Button>
            }
          />
        ) : null}
      </div>

      <BranchStockIssueLineSheet
        open={lineSheetOpen}
        issueId={issue.id}
        tenantId={data.tenantId}
        showConsumptionPhoto={issue.type === "consumption"}
        line={editingLine}
        ingredients={data.ingredients}
        isPending={isPending}
        startTransition={startTransition}
        onOpenChange={(nextOpen) => {
          setLineSheetOpen(nextOpen);
          if (!nextOpen) setEditingLine(null);
        }}
        onSaved={() => router.refresh()}
      />
    </BranchOperatorPage>
  );
}
