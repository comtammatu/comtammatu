"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus as IconPlus,
  Trash as IconTrash,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
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
import { AppEmptyState, AppSection } from "@/components/surface";
import { FormattedNumberInput } from "../_components/formatted-number-input";
import { formatBranchSiteLabel } from "../_lib/branch-site-labels";
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
}: {
  branches: BranchForTransfer[];
  ingredients: IngredientRow[];
  userBranchId: number | null;
  userRole: StaffRole;
  basePath?: string;
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
  const outboundDestinationOptions = branches.filter((branch) => {
    if (!branch.is_active || branch.id === outboundSourceBranchId) return false;
    return (branch.branch_kind ?? "branch") === "branch";
  });

  const [outboundToBranchId, setOutboundToBranchId] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [pickerIngredientId, setPickerIngredientId] = useState("");
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

  function resetForm() {
    setOutboundToBranchId("");
    setDraftLines([]);
    setPickerIngredientId("");
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
    setDraftLines((current) => [
      ...current,
      {
        key: `${ingredient.id}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`,
        ingredientId: ingredient.id,
        name: ingredient.name,
        quantity: "",
        unit: getWarehouseUnit(ingredient),
      },
    ]);
    setPickerIngredientId("");
  }

  function removeLine(key: string) {
    setDraftLines((current) => current.filter((line) => line.key !== key));
  }

  function updateLine(
    key: string,
    patch: Partial<Pick<DraftLine, "quantity" | "unit">>,
  ) {
    setDraftLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function buildLinesPayload(
    lines: DraftLine[],
  ): { ingredientId: number; quantity: number; unit: string }[] | undefined {
    const out: { ingredientId: number; quantity: number; unit: string }[] = [];
    for (const line of lines) {
      const quantity = Number(line.quantity);
      const unit = line.unit.trim();
      if (!Number.isFinite(quantity) || quantity <= 0 || !unit) {
        toast.error("Kiểm tra số lượng và đơn vị cho từng dòng");
        return undefined;
      }
      out.push({ ingredientId: line.ingredientId, quantity, unit });
    }
    return out.length > 0 ? out : undefined;
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const notes = String(formData.get("notes") ?? "") || undefined;
    const vehicleInfo = String(formData.get("vehicleInfo") ?? "") || undefined;

    if (!canCreateOutbound || outboundSourceBranchId == null) {
      toast.error(messages.inventory.transfer.createForbidden);
      return;
    }

    const toBranchId = Number(outboundToBranchId) || undefined;
    if (!toBranchId) {
      toast.error("Chọn kho nhận.");
      return;
    }

    const linesPayload = buildLinesPayload(draftLines);
    if (linesPayload === undefined) return;

    startTransition(async () => {
      const res = await createStockTransfer({
        fromBranchId: outboundSourceBranchId,
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
    !canCreateOutbound ||
    !outboundToBranchId ||
    draftLines.length === 0;

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
      <AppSection
        title={messages.inventory.transfer.createTransferTitle}
        contentClassName="gap-4"
      >
        {canCreateOutbound ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {myBranchName
                ? messages.inventory.transfer.outboundFromBranch(myBranchName)
                : messages.inventory.transfer.outboundFromSelected}
            </p>
            <div className="flex flex-col gap-1.5">
              <Label>
                {messages.inventory.transfer.receivingWarehouseRequired}
              </Label>
              <Select
                value={outboundToBranchId}
                onValueChange={setOutboundToBranchId}
              >
                <SelectTrigger>
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

      <AppSection title={messages.inventory.transfer.ingredientsQtyRequired}>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Select
              value={pickerIngredientId}
              onValueChange={setPickerIngredientId}
            >
              <SelectTrigger className="h-9">
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
            size="sm"
            className="shrink-0"
            onClick={addIngredientLine}
            disabled={!pickerIngredientId}
            aria-label={messages.inventory.transfer.addIngredientAria}
          >
            <IconPlus data-icon="inline-start" />
          </Button>
        </div>

        {draftLines.length === 0 ? (
          <AppEmptyState
            compact
            title={messages.inventory.transfer.emptyIngredientsTitle}
            description={messages.inventory.transfer.emptyIngredientsDescription}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {draftLines.map((line) => (
              <div
                key={line.key}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
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
                <Input
                  className="h-8 w-16"
                  value={line.unit}
                  readOnly
                  aria-readonly="true"
                  required
                />
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
            ))}
          </div>
        )}
      </AppSection>

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
    </form>
  );
}
