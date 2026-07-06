"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus as IconPlus, Trash as IconTrash } from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { ItemGroup } from "@comtammatu/ui/components/item";
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
import { NumberPadSheet, FormattedNumberInput } from "@/components/form";
import {
  AppDetailFooter,
  AppEmptyState,
  AppSection,
  DescriptionList,
} from "@/components/surface";
import { formatBranchSiteLabel } from "../_lib/branch-site-labels";
import { getDefaultIssueUnit, getIssueUnitOptions } from "../_lib/issue-units";
import { createStockTransfer } from "../transfer-actions";
import type { IngredientRow } from "../page";
import { messages } from "@lib/messages";

import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";

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

function getWarehouseUnit(ingredient: IngredientRow) {
  return ingredient.purchase_unit || ingredient.unit;
}

function withBranchQuery(path: string, branchId: number | null) {
  return branchId == null ? path : `${path}?branchId=${branchId}`;
}

function isTransferSourceKind(kind: string | null | undefined): boolean {
  return (
    kind === "branch" || kind === "central_supply" || kind === "central_kitchen"
  );
}

export function CreateTransferForm({
  branches,
  ingredients,
  userBranchId,
  userRole,
  basePath = "/inventory/transfers",
  embedded = false,
}: {
  branches: BranchForTransfer[];
  ingredients: IngredientRow[];
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
  const outboundDestinationOptions = branches.filter((branch) => {
    if (!branch.is_active || branch.id === outboundSourceBranchId) return false;
    return (branch.branch_kind ?? "branch") === "branch";
  });
  const inboundSourceOptions = branches.filter((branch) => {
    if (!branch.is_active || branch.id === requestDestinationBranchId) {
      return false;
    }
    const kind = branch.branch_kind ?? "branch";
    return kind === "central_supply" || kind === "central_kitchen";
  });

  const [outboundToBranchId, setOutboundToBranchId] = useState("");
  const [inboundFromBranchId, setInboundFromBranchId] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [pickerIngredientId, setPickerIngredientId] = useState("");
  // The line whose quantity number-pad drawer is open (null = closed). The pad
  // is a bottom sheet so the line list stays scrollable and the keypad rises to
  // the thumb on tap — mobile only.
  const [numpadLineKey, setNumpadLineKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
    const branch = branches.find(
      (item) => String(item.id) === outboundToBranchId,
    );
    return branch ? formatBranchSiteLabel(branch) : null;
  }, [branches, outboundToBranchId]);
  const inboundSourceName = useMemo(() => {
    const branch = branches.find((item) => String(item.id) === inboundFromBranchId);
    return branch ? formatBranchSiteLabel(branch) : null;
  }, [branches, inboundFromBranchId]);

  const numpadLine = useMemo(
    () => draftLines.find((line) => line.key === numpadLineKey) ?? null,
    [draftLines, numpadLineKey],
  );

  function resetForm() {
    setOutboundToBranchId("");
    setInboundFromBranchId("");
    setDraftLines([]);
    setPickerIngredientId("");
    setNumpadLineKey(null);
  }

  function addIngredientLine() {
    const ingredientId = Number(pickerIngredientId);
    const ingredient = ingredients.find((item) => item.id === ingredientId);
    if (!ingredient) {
      toast.error("Chọn nguyên liệu");
      return;
    }
    if (draftLines.some((line) => line.ingredientId === ingredientId)) {
      toast.error("Nguyên liệu đã có trong danh sách");
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
        toast.error("Kiểm tra số lượng và đơn vị cho từng dòng");
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
    let toBranchId = Number(outboundToBranchId) || undefined;

    if (isBranchManager) {
      fromBranchId = Number(inboundFromBranchId) || undefined;
      toBranchId = requestDestinationBranchId ?? undefined;
      if (!fromBranchId) {
        toast.error("Chọn kho cấp hàng.");
        return;
      }
    } else if (!toBranchId) {
      toast.error("Chọn kho nhận.");
      return;
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
        lines: linesPayload,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không tạo được phiếu");
        return;
      }
      toast.success("Đã tạo phiếu điều chuyển");
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
                  term: "Kho đi",
                  description:
                    inboundSourceName ??
                    messages.inventory.transfer.chooseSendingWarehouse,
                },
                {
                  term: "Kho đến",
                  description:
                    myBranchName ?? messages.inventory.transfer.inboundToSelected,
                },
              ]}
            />
            <div className="flex flex-col gap-1.5">
              <Label>
                {messages.inventory.transfer.sendingWarehouseRequired}
              </Label>
              <Select
                value={inboundFromBranchId}
                onValueChange={setInboundFromBranchId}
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
                        {formatBranchSiteLabel(branch)}
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
                  term: "Kho đi",
                  description:
                    myBranchName ??
                    messages.inventory.transfer.outboundFromSelected,
                },
                {
                  term: "Kho đến",
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
                      <SelectItem key={branch.id} value={String(branch.id)}>
                        {formatBranchSiteLabel(branch)}
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
          <div className="flex items-end gap-2">
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
                const hasQty = line.quantity.trim().length > 0;
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
                      <Button
                        type="button"
                        variant="outline"
                        size="touch"
                        className="justify-between font-normal"
                        onClick={() => setNumpadLineKey(line.key)}
                      >
                        <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                          {messages.inventory.common.quantityShort}
                        </span>
                        <span
                          className={
                            hasQty
                              ? "text-base font-semibold tabular-nums"
                              : "text-sm text-muted-foreground"
                          }
                        >
                          {hasQty
                            ? line.quantity
                            : messages.inventory.transfer.createNative
                                .quantityUnset}
                        </span>
                      </Button>
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
                return (
                  <div
                    key={line.key}
                    className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {line.name}
                    </span>
                    <FormattedNumberInput
                      className="h-8 w-20"
                      placeholder={messages.inventory.common.quantityShort}
                      value={line.quantity}
                      onValueChange={(value) =>
                        updateLine(line.key, { quantity: value })
                      }
                      maxFractionDigits={3}
                      required
                    />
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
                          });
                        }}
                      >
                        <SelectTrigger
                          className="h-8 w-20"
                          aria-label={messages.inventory.transfer.unit}
                        >
                          <SelectValue
                            placeholder={messages.inventory.transfer.selectUnit}
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
                  </div>
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

      {embedded ? (
        <NumberPadSheet
          open={numpadLine != null}
          onOpenChange={(next) => {
            if (!next) setNumpadLineKey(null);
          }}
          title={
            numpadLine
              ? `${numpadLine.name} · ${numpadLine.unit}`
              : messages.inventory.transfer.createNative.quantityPrompt
          }
          suffix={numpadLine?.unit}
          initialValue={
            numpadLine && numpadLine.quantity.trim().length > 0
              ? Number(numpadLine.quantity)
              : null
          }
          onConfirm={(value) => {
            if (numpadLine) {
              updateLine(numpadLine.key, { quantity: String(value) });
            }
          }}
          allowDecimal
        />
      ) : null}
    </form>
  );
}
