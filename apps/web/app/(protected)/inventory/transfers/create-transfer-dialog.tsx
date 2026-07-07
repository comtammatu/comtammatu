"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PackageCheck as IconPackageCheck,
  Plus as IconPlus,
  Trash as IconTrash,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { Progress } from "@comtammatu/ui/components/progress";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { FormattedNumberInput } from "@/components/form";
import {
  AppDetailFooter,
  AppEmptyState,
  AppSection,
  DescriptionList,
} from "@/components/surface";
import { formatBranchSiteLabel } from "../_lib/branch-site-labels";
import {
  clampIssueEntryQuantity,
  formatIssueMaxEntryQuantity,
  getDefaultIssueUnit,
  getIssueBaseQuantity,
  getIssueMaxEntryQuantity,
  getIssueUnitOptions,
} from "../_lib/issue-units";
import { createStockTransfer } from "../transfer-actions";
import type { IngredientRow } from "../page";
import { messages } from "@lib/messages";

import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";

const termSourceBranch = "Kho đi";
const termTargetBranch = "Kho đến";
const toastChooseIngredient = "Chọn nguyên liệu";
const toastIngredientAlreadyExists = "Nguyên liệu đã có trong danh sách";
const toastCheckLineQtyAndUnit = "Kiểm tra số lượng và đơn vị cho từng dòng";
const toastChooseSourceBranch = "Chọn kho cấp hàng.";
const toastChooseTargetBranch = "Chọn kho nhận.";
const toastCreateFailed = "Không tạo được phiếu";
const toastCreateSuccess = "Đã tạo phiếu điều chuyển";

export interface BranchForTransfer {
  id: number;
  name: string;
  branch_kind?: string | null;
  is_active: boolean;
}

type DraftLine = {
  key: string;
  ingredientId: number;
  name: string;
  quantity: string;
  unit: string;
  entryUnitId: string;
};

type TransferTargetKind = "warehouse" | "kitchen";

type TransferTargetOption = {
  value: string;
  branch: BranchForTransfer;
  kind: TransferTargetKind;
};

function getWarehouseUnit(ingredient: IngredientRow) {
  return ingredient.units?.find((u) => u.is_base)?.unit_code || "";
}

function withBranchQuery(path: string, branchId: number | null) {
  return branchId == null ? path : `${path}?branchId=${branchId}`;
}

function isTransferSourceKind(kind: string | null | undefined): boolean {
  return (
    kind === "branch" || kind === "central_supply" || kind === "central_kitchen"
  );
}

function formatTransferOption(
  branch: BranchForTransfer,
  homeBranchId: number | null,
) {
  const label = formatBranchSiteLabel(branch);
  if (homeBranchId != null && branch.id === homeBranchId) {
    return `${label}${messages.inventory.transfer.defaultKitchenSuffix}`;
  }
  return label;
}

function transferTargetValue(
  branchId: number,
  kind: TransferTargetKind,
): string {
  return `${branchId}:${kind}`;
}

function parseTransferTargetValue(value: string): {
  branchId: number;
  kind: TransferTargetKind;
} | null {
  const [branchIdRaw, kindRaw] = value.split(":");
  const branchId = Number(branchIdRaw);
  if (!Number.isInteger(branchId) || branchId <= 0) return null;
  if (kindRaw !== "warehouse" && kindRaw !== "kitchen") return null;
  return { branchId, kind: kindRaw };
}

function formatTransferTargetOption(option: TransferTargetOption): string {
  const suffix =
    option.kind === "kitchen"
      ? messages.inventory.transfer.defaultKitchenSuffix
      : messages.inventory.transfer.defaultWarehouseSuffix;
  return `${formatBranchSiteLabel(option.branch)}${suffix}`;
}

export function CreateTransferForm({
  branches,
  ingredients,
  sourceStockByBranch,
  userBranchId,
  userRole,
  basePath = "/inventory/transfers",
  embedded = false,
}: {
  branches: BranchForTransfer[];
  ingredients: IngredientRow[];
  sourceStockByBranch: Record<number, Record<number, number>>;
  userBranchId: number | null;
  userRole: StaffRole;
  basePath?: string;
  embedded?: boolean;
}) {
  const router = useRouter();
  const isBranchManager = userRole === "branch_manager";
  const currentBranch =
    userBranchId == null
      ? null
      : (branches.find((branch) => branch.id === userBranchId) ?? null);
  const currentBranchKind = currentBranch?.branch_kind ?? null;
  const outboundSourceBranchId = userBranchId;
  const canCreateOutbound =
    !isBranchManager &&
    outboundSourceBranchId != null &&
    isTransferSourceKind(currentBranchKind);
  const requestDestinationBranchId =
    isBranchManager && currentBranchKind === "branch" ? userBranchId : null;
  const canCreateInboundRequest = requestDestinationBranchId != null;
  const outboundDestinationOptions = branches.flatMap((branch) => {
    if (!branch.is_active) return [];
    if (branch.id === outboundSourceBranchId) {
      return currentBranchKind === "branch"
        ? [
            {
              value: transferTargetValue(branch.id, "kitchen"),
              branch,
              kind: "kitchen" as const,
            },
          ]
        : [];
    }
    if ((branch.branch_kind ?? "branch") !== "branch") return [];
    return [
      {
        value: transferTargetValue(branch.id, "warehouse"),
        branch,
        kind: "warehouse" as const,
      },
      {
        value: transferTargetValue(branch.id, "kitchen"),
        branch,
        kind: "kitchen" as const,
      },
    ];
  });
  const inboundSourceOptions = branches.filter((branch) => {
    if (!branch.is_active) return false;
    const kind = branch.branch_kind ?? "branch";
    if (branch.id === requestDestinationBranchId) {
      return kind === "branch";
    }
    return kind === "central_supply" || kind === "central_kitchen";
  });

  const [outboundToBranchId, setOutboundToBranchId] = useState("");
  const [inboundFromBranchId, setInboundFromBranchId] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [pickerIngredientId, setPickerIngredientId] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedSourceBranchId = isBranchManager
    ? Number(inboundFromBranchId) || null
    : outboundSourceBranchId;

  const myBranchName = useMemo(() => {
    if (userBranchId == null) return null;
    const branch = branches.find((item) => item.id === userBranchId);
    return branch ? formatBranchSiteLabel(branch) : null;
  }, [branches, userBranchId]);

  const activeIngredients = useMemo(
    () => ingredients.filter((ingredient) => ingredient.is_active),
    [ingredients],
  );

  // "gửi từ" context for each mobile line card: the branch manager picks the
  // sending warehouse (inbound request), everyone else ships from their own.
  const sourceContextLabel = useMemo(() => {
    if (isBranchManager) {
      const from = branches.find(
        (branch) => String(branch.id) === inboundFromBranchId,
      );
      return from ? formatBranchSiteLabel(from) : null;
    }
    return myBranchName;
  }, [branches, inboundFromBranchId, isBranchManager, myBranchName]);
  const outboundDestinationName = useMemo(() => {
    const option = outboundDestinationOptions.find(
      (item) => item.value === outboundToBranchId,
    );
    return option ? formatTransferTargetOption(option) : null;
  }, [outboundDestinationOptions, outboundToBranchId]);
  const inboundSourceName = useMemo(() => {
    const branch = branches.find(
      (item) => String(item.id) === inboundFromBranchId,
    );
    return branch ? formatBranchSiteLabel(branch) : null;
  }, [branches, inboundFromBranchId]);

  function resetForm() {
    setOutboundToBranchId("");
    setInboundFromBranchId("");
    setDraftLines([]);
    setPickerIngredientId("");
  }

  function getLineIngredient(line: DraftLine) {
    return ingredients.find((item) => item.id === line.ingredientId);
  }

  function getLineIssueUnit(line: DraftLine) {
    return getIssueUnitOptions(getLineIngredient(line)).find(
      (option) => String(option.unitId) === line.entryUnitId,
    );
  }

  function getLineMaxEntryQuantity(
    line: DraftLine,
    sourceBranchId: number | null,
  ) {
    if (sourceBranchId == null) return 0;
    const availableBaseQuantity =
      sourceStockByBranch[sourceBranchId]?.[line.ingredientId] ?? 0;
    return getIssueMaxEntryQuantity(
      availableBaseQuantity,
      getLineIssueUnit(line),
    );
  }

  function clampLineForSource(
    line: DraftLine,
    sourceBranchId: number | null,
  ): DraftLine {
    return {
      ...line,
      quantity: clampIssueEntryQuantity(
        line.quantity,
        getLineMaxEntryQuantity(line, sourceBranchId),
      ),
    };
  }

  function handleInboundSourceChange(value: string) {
    const nextSourceBranchId = Number(value) || null;
    setInboundFromBranchId(value);
    setDraftLines((current) =>
      current.map((line) => clampLineForSource(line, nextSourceBranchId)),
    );
  }

  function addIngredientLine() {
    const ingredientId = Number(pickerIngredientId);
    const ingredient = ingredients.find((item) => item.id === ingredientId);
    if (!ingredient) {
      toast.error(toastChooseIngredient);
      return;
    }
    if (draftLines.some((line) => line.ingredientId === ingredientId)) {
      toast.error(toastIngredientAlreadyExists);
      return;
    }
    const defaultUnit = getDefaultIssueUnit(ingredient);
    setDraftLines((current) => [
      ...current,
      {
        key: `${ingredient.id}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`,
        ingredientId: ingredient.id,
        name: ingredient.name,
        quantity: "",
        unit: defaultUnit?.label ?? getWarehouseUnit(ingredient),
        entryUnitId: defaultUnit ? String(defaultUnit.unitId) : "",
      },
    ]);
    setPickerIngredientId("");
  }

  function addAllAvailableStockLines() {
    if (selectedSourceBranchId == null) {
      toast.error(toastChooseSourceBranch);
      return;
    }

    const sourceStock = sourceStockByBranch[selectedSourceBranchId] ?? {};
    const nextLines = activeIngredients.flatMap((ingredient) => {
      const defaultUnit = getDefaultIssueUnit(ingredient);
      const quantity = formatIssueMaxEntryQuantity(
        getIssueMaxEntryQuantity(sourceStock[ingredient.id] ?? 0, defaultUnit),
      );
      if (!quantity) return [];

      return [
        {
          key: `all-${ingredient.id}`,
          ingredientId: ingredient.id,
          name: ingredient.name,
          quantity,
          unit: defaultUnit?.label ?? getWarehouseUnit(ingredient),
          entryUnitId: defaultUnit ? String(defaultUnit.unitId) : "",
        },
      ];
    });

    if (nextLines.length === 0) {
      toast.error(messages.inventory.transfer.noStockToTransfer);
      return;
    }

    setDraftLines(nextLines);
    setPickerIngredientId("");
  }

  function removeLine(key: string) {
    setDraftLines((current) => current.filter((line) => line.key !== key));
  }

  function updateLine(
    key: string,
    patch: Partial<Pick<DraftLine, "quantity" | "unit" | "entryUnitId">>,
  ) {
    setDraftLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function buildLinesPayload(lines: DraftLine[]):
    | {
        ingredientId: number;
        quantity: number;
        entryUnitId: number | null;
      }[]
    | undefined {
    const out: {
      ingredientId: number;
      quantity: number;
      entryUnitId: number | null;
    }[] = [];
    for (const line of lines) {
      const quantity = Number(line.quantity);
      const unit = line.unit.trim();
      if (!Number.isFinite(quantity) || quantity <= 0 || !unit) {
        toast.error(toastCheckLineQtyAndUnit);
        return undefined;
      }
      const issueUnit = getLineIssueUnit(line);
      const maxEntryQuantity = getLineMaxEntryQuantity(
        line,
        selectedSourceBranchId,
      );
      if (
        getIssueBaseQuantity(quantity, issueUnit) >
        getIssueBaseQuantity(maxEntryQuantity, issueUnit) + 1e-9
      ) {
        toast.error("Số lượng vượt tồn hiện tại.");
        return undefined;
      }
      out.push({
        ingredientId: line.ingredientId,
        quantity,
        entryUnitId: line.entryUnitId ? Number(line.entryUnitId) : null,
      });
    }
    return out.length > 0 ? out : undefined;
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const notes = String(formData.get("notes") ?? "") || undefined;
    const vehicleInfo = String(formData.get("vehicleInfo") ?? "") || undefined;

    if (!canCreateOutbound && !canCreateInboundRequest) {
      toast.error(messages.inventory.transfer.createForbidden);
      return;
    }

    let fromBranchId = outboundSourceBranchId ?? undefined;
    let toBranchId: number | undefined;
    let toLocationKind: "default_receive" | "branch_kitchen" | undefined;

    if (isBranchManager) {
      fromBranchId = Number(inboundFromBranchId) || undefined;
      toBranchId = requestDestinationBranchId ?? undefined;
      if (!fromBranchId) {
        toast.error(toastChooseSourceBranch);
        return;
      }
    } else {
      const target = parseTransferTargetValue(outboundToBranchId);
      if (!target) {
        toast.error(toastChooseTargetBranch);
        return;
      }
      toBranchId = target.branchId;
      toLocationKind =
        target.kind === "kitchen" ? "branch_kitchen" : "default_receive";
    }
    if (!fromBranchId || !toBranchId) return;

    const linesPayload = buildLinesPayload(draftLines);
    if (linesPayload === undefined) return;

    startTransition(async () => {
      const res = await createStockTransfer({
        fromBranchId,
        toBranchId,
        notes,
        vehicleInfo,
        toLocationKind,
        lines: linesPayload,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? toastCreateFailed);
        return;
      }
      toast.success(toastCreateSuccess);
      resetForm();
      const id = (res.data as { id: number }).id;
      router.push(withBranchQuery(`${basePath}/${id}`, userBranchId));
      router.refresh();
    });
  }

  const submitDisabled =
    isPending ||
    (!canCreateOutbound && !canCreateInboundRequest) ||
    (isBranchManager ? !inboundFromBranchId : !outboundToBranchId) ||
    draftLines.length === 0;
  const operatorFlow = messages.inventory.operatorFlow;
  const selectedBranch = isBranchManager
    ? Boolean(inboundFromBranchId)
    : Boolean(outboundToBranchId);
  const flowSteps = operatorFlow.transferCreateSteps;
  const flowStep = draftLines.length > 0 ? 3 : selectedBranch ? 2 : 1;
  const flowStepMeta = flowSteps[flowStep - 1] ?? {
    label: operatorFlow.transferCreateTitle,
    hint: operatorFlow.transferCreateDescription,
  };
  const flowProgressValue = Math.round((flowStep / flowSteps.length) * 100);
  const showLineSection = !embedded || selectedBranch;
  const showNotesSection = !embedded || draftLines.length > 0;

  return (
    <form
      onSubmit={submit}
      className={`flex min-w-0 flex-col ${embedded ? "gap-3" : "gap-4"}`}
    >
      {embedded ? (
        <div className="flex flex-col gap-2 px-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                {operatorFlow.stepBadge(flowStep, flowSteps.length)}
              </p>
              <p className="mt-1 text-sm font-semibold">{flowStepMeta.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {flowStepMeta.hint}
              </p>
            </div>
            <span className="shrink-0 text-xs font-medium text-primary">
              {operatorFlow.current}
            </span>
          </div>
          <Progress className="h-2" value={flowProgressValue} />
        </div>
      ) : null}

      <AppSection title={messages.inventory.transfer.createTransferTitle}>
        {canCreateInboundRequest ? (
          <div className="flex flex-col gap-3">
            <DescriptionList
              className="grid gap-2 sm:grid-cols-2"
              descriptionClassName="font-semibold"
              items={[
                {
                  term: termSourceBranch,
                  description:
                    inboundSourceName ??
                    messages.inventory.transfer.chooseSendingWarehouse,
                },
                {
                  term: termTargetBranch,
                  description:
                    myBranchName ??
                    messages.inventory.transfer.inboundToSelected,
                },
              ]}
            />
            <div className="flex flex-col gap-1.5">
              <Label>
                {messages.inventory.transfer.sendingWarehouseRequired}
              </Label>
              <Select
                value={inboundFromBranchId}
                onValueChange={handleInboundSourceChange}
              >
                <SelectTrigger
                  size={embedded ? "touch" : "default"}
                  className="w-full"
                >
                  <SelectValue
                    placeholder={
                      messages.inventory.transfer.chooseSendingWarehouse
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {inboundSourceOptions.map((branch) => (
                      <SelectItem key={branch.id} value={String(branch.id)}>
                        {formatTransferOption(
                          branch,
                          requestDestinationBranchId,
                        )}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : canCreateOutbound ? (
          <div className="flex flex-col gap-3">
            <DescriptionList
              className="grid gap-2 sm:grid-cols-2"
              descriptionClassName="font-semibold"
              items={[
                {
                  term: termSourceBranch,
                  description:
                    myBranchName ??
                    messages.inventory.transfer.outboundFromSelected,
                },
                {
                  term: termTargetBranch,
                  description:
                    outboundDestinationName ??
                    messages.inventory.transfer.chooseReceivingWarehouse,
                },
              ]}
            />
            <div className="flex flex-col gap-1.5">
              <Label>
                {messages.inventory.transfer.receivingWarehouseRequired}
              </Label>
              <Select
                value={outboundToBranchId}
                onValueChange={setOutboundToBranchId}
              >
                <SelectTrigger
                  size={embedded ? "touch" : "default"}
                  className="w-full"
                >
                  <SelectValue
                    placeholder={
                      messages.inventory.transfer.chooseReceivingWarehouse
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {outboundDestinationOptions.map((branch) => (
                      <SelectItem key={branch.value} value={branch.value}>
                        {formatTransferTargetOption(branch)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <AppEmptyState
            compact
            title={messages.inventory.transfer.createUnavailableTitle}
            description={messages.inventory.transfer.createForbidden}
          />
        )}
      </AppSection>

      {showLineSection ? (
        <AppSection title={messages.inventory.transfer.ingredientsQtyRequired}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex min-w-0 flex-1 items-end gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  value={pickerIngredientId}
                  onValueChange={setPickerIngredientId}
                >
                  <SelectTrigger
                    className={embedded ? undefined : "h-9"}
                    size={embedded ? "touch" : "default"}
                  >
                    <SelectValue
                      placeholder={messages.inventory.transfer.chooseIngredient}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {activeIngredients.map((ingredient) => (
                        <SelectItem
                          key={ingredient.id}
                          value={String(ingredient.id)}
                          textValue={`${ingredient.name} ${getWarehouseUnit(
                            ingredient,
                          )} ${ingredient.id}`}
                        >
                          {ingredient.name} ({getWarehouseUnit(ingredient)})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size={embedded ? "touch" : "sm"}
                className="shrink-0"
                onClick={addIngredientLine}
                disabled={!pickerIngredientId}
                aria-label={messages.inventory.transfer.addIngredientAria}
              >
                <IconPlus data-icon="inline-start" />
                {embedded
                  ? messages.inventory.transfer.createNative.addLine
                  : null}
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              size={embedded ? "touch" : "sm"}
              className="w-full shrink-0 sm:w-auto"
              onClick={addAllAvailableStockLines}
              disabled={selectedSourceBranchId == null}
            >
              <IconPackageCheck data-icon="inline-start" />
              {messages.inventory.transfer.transferAllStock}
            </Button>
          </div>

          {draftLines.length === 0 ? (
            <AppEmptyState
              compact
              title={messages.inventory.transfer.emptyIngredientsTitle}
              description={
                messages.inventory.transfer.emptyIngredientsDescription
              }
            />
          ) : embedded ? (
            <ItemGroup className="gap-2">
              {draftLines.map((line) => {
                const lineIngredient = ingredients.find(
                  (item) => item.id === line.ingredientId,
                );
                const lineUnitOptions = getIssueUnitOptions(lineIngredient);
                const maxEntryQuantity = getLineMaxEntryQuantity(
                  line,
                  selectedSourceBranchId,
                );
                const maxQuantityValue =
                  formatIssueMaxEntryQuantity(maxEntryQuantity);
                return (
                  <InteractiveCard
                    key={line.key}
                    padding="compact"
                    className="flex-col items-stretch gap-3"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {line.name}
                        </p>
                        {sourceContextLabel ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {messages.inventory.transfer.createNative.sendFrom(
                              sourceContextLabel,
                            )}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="touch"
                        className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeLine(line.key)}
                        aria-label={messages.inventory.transfer.removeLineAria}
                      >
                        <IconTrash />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <InputGroup className="h-12">
                        <FormattedNumberInput
                          maxFractionDigits={3}
                          aria-label={messages.inventory.common.quantityShort}
                          value={line.quantity}
                          onValueChange={(value) =>
                            updateLine(line.key, {
                              quantity: clampIssueEntryQuantity(
                                value,
                                maxEntryQuantity,
                              ),
                            })
                          }
                          placeholder={
                            messages.inventory.transfer.createNative
                              .quantityUnset
                          }
                          className="h-full flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-1 dark:bg-transparent"
                          required
                        />
                        {maxQuantityValue ? (
                          <InputGroupAddon align="inline-end">
                            <InputGroupButton
                              type="button"
                              onClick={() =>
                                updateLine(line.key, {
                                  quantity: maxQuantityValue,
                                })
                              }
                            >
                              {FORM_VI.max}
                            </InputGroupButton>
                          </InputGroupAddon>
                        ) : null}
                      </InputGroup>
                      {lineUnitOptions.length > 0 ? (
                        <Select
                          value={line.entryUnitId}
                          onValueChange={(value) => {
                            const opt = lineUnitOptions.find(
                              (o) => String(o.unitId) === value,
                            );
                            updateLine(line.key, {
                              entryUnitId: value,
                              unit: opt?.label ?? line.unit,
                              quantity: clampIssueEntryQuantity(
                                line.quantity,
                                getLineMaxEntryQuantity(
                                  { ...line, entryUnitId: value },
                                  selectedSourceBranchId,
                                ),
                              ),
                            });
                          }}
                        >
                          <SelectTrigger
                            size="touch"
                            className="w-full"
                            aria-label={messages.inventory.transfer.unit}
                          >
                            <SelectValue
                              placeholder={
                                messages.inventory.transfer.selectUnit
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {lineUnitOptions.map((o) => (
                                <SelectItem
                                  key={o.unitId}
                                  value={String(o.unitId)}
                                >
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          className="h-12"
                          value={line.unit}
                          readOnly
                          aria-readonly="true"
                          required
                        />
                      )}
                    </div>
                  </InteractiveCard>
                );
              })}
            </ItemGroup>
          ) : (
            <div className="flex flex-col gap-2">
              {draftLines.map((line) => {
                const lineIngredient = ingredients.find(
                  (item) => item.id === line.ingredientId,
                );
                const lineUnitOptions = getIssueUnitOptions(lineIngredient);
                const maxEntryQuantity = getLineMaxEntryQuantity(
                  line,
                  selectedSourceBranchId,
                );
                const maxQuantityValue =
                  formatIssueMaxEntryQuantity(maxEntryQuantity);
                return (
                  <Item key={line.key} variant="outline" size="sm" className="flex-nowrap justify-between gap-4 w-full">
                    <ItemContent className="min-w-0 flex-1">
                      <span className="truncate text-sm font-medium">
                        {line.name}
                      </span>
                    </ItemContent>
                    <ItemActions className="shrink-0 flex items-center gap-2">
                      <InputGroup className="h-8 w-32">
                        <FormattedNumberInput
                          className="h-full flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-1 dark:bg-transparent"
                          placeholder={messages.inventory.common.quantityShort}
                          aria-label={messages.inventory.common.quantityShort}
                          value={line.quantity}
                          onValueChange={(value) =>
                            updateLine(line.key, {
                              quantity: clampIssueEntryQuantity(
                                value,
                                maxEntryQuantity,
                              ),
                            })
                          }
                          maxFractionDigits={3}
                          required
                        />
                        {maxQuantityValue ? (
                          <InputGroupAddon align="inline-end">
                            <InputGroupButton
                              type="button"
                              onClick={() =>
                                updateLine(line.key, {
                                  quantity: maxQuantityValue,
                                })
                              }
                            >
                              {FORM_VI.max}
                            </InputGroupButton>
                          </InputGroupAddon>
                        ) : null}
                      </InputGroup>
                      {lineUnitOptions.length > 0 ? (
                        <Select
                          value={line.entryUnitId}
                          onValueChange={(value) => {
                            const opt = lineUnitOptions.find(
                              (o) => String(o.unitId) === value,
                            );
                            updateLine(line.key, {
                              entryUnitId: value,
                              unit: opt?.label ?? line.unit,
                              quantity: clampIssueEntryQuantity(
                                line.quantity,
                                getLineMaxEntryQuantity(
                                  { ...line, entryUnitId: value },
                                  selectedSourceBranchId,
                                ),
                              ),
                            });
                          }}
                        >
                          <SelectTrigger
                            className="h-8 w-20"
                            aria-label={messages.inventory.transfer.unit}
                          >
                            <SelectValue
                              placeholder={
                                messages.inventory.transfer.selectUnit
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {lineUnitOptions.map((o) => (
                                <SelectItem
                                  key={o.unitId}
                                  value={String(o.unitId)}
                                >
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          className="h-8 w-16"
                          value={line.unit}
                          readOnly
                          aria-readonly="true"
                          required
                        />
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        onClick={() => removeLine(line.key)}
                        aria-label={messages.inventory.transfer.removeLineAria}
                      >
                        <IconTrash />
                      </Button>
                    </ItemActions>
                  </Item>
                );
              })}
            </div>
          )}
        </AppSection>
      ) : null}

      {showNotesSection ? (
        <AppSection title={FORM_VI.notes}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicleInfo">
              {messages.inventory.transfer.vehicleInfo}
            </Label>
            <Input id="vehicleInfo" name="vehicleInfo" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">{FORM_VI.notes}</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder={messages.inventory.transfer.notesPlaceholder}
              className="min-h-24"
            />
          </div>
        </AppSection>
      ) : null}

      {embedded ? (
        <AppDetailFooter
          sticky
          leading={
            <Button variant="outline" size="touch" asChild>
              <Link href={withBranchQuery(basePath, userBranchId)}>
                {ACTIONS_VI.cancel}
              </Link>
            </Button>
          }
          trailing={
            <Button type="submit" size="touch-lg" disabled={submitDisabled}>
              {isPending
                ? messages.inventory.transfer.creating
                : messages.inventory.transfer.createNative.submit}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" asChild>
            <Link href={withBranchQuery(basePath, userBranchId)}>
              {ACTIONS_VI.cancel}
            </Link>
          </Button>
          <Button type="submit" disabled={submitDisabled}>
            {isPending
              ? messages.inventory.transfer.creating
              : messages.inventory.transfer.createSlip}
          </Button>
        </div>
      )}
    </form>
  );
}
