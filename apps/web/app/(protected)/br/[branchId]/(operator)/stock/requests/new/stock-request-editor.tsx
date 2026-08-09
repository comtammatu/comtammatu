"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus as IconPlus, Trash as IconTrash } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Combobox } from "@comtammatu/ui/components/combobox";
import { Input } from "@comtammatu/ui/components/input";
import { Item, ItemContent, ItemTitle } from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { QuantityInput } from "@/components/form";
import { useIsOnline } from "@/components/pwa-runtime";
import { AppDetailFooter, AppSection } from "@/components/surface";
import { saveStockRequest } from "@/(protected)/inventory/stock-request-actions";
import { messages } from "@lib/messages";
import { applyInventoryActionError } from "@lib/inventory/apply-inventory-action-error";
import { matchesSearch } from "@lib/search";

const copy = messages.inventory.stockRequests.editor;

export type StockRequestIngredientOption = {
  id: number;
  name: string;
  sku: string | null;
  fulfillSiteKind: "central_supply" | "central_kitchen";
  /** Base-unit INV-10 suggestion; 0 when at/above min. Editable after prefill. */
  suggestedOrderQty: number;
  units: Array<{ id: number; label: string; isBase: boolean }>;
};

export type StockRequestEditorLine = {
  id?: number;
  ingredientId: number;
  entryUnitId: number;
  quantity: number;
};

type DraftLine = {
  key: string;
  ingredientId: string;
  entryUnitId: string;
  quantity: string;
};

const emptyLine = (): DraftLine => ({
  key: crypto.randomUUID(),
  ingredientId: "",
  entryUnitId: "",
  quantity: "",
});
const ingredientFilter = (
  option: { label: string; keywords?: string[] },
  query: string,
) => matchesSearch([option.label, ...(option.keywords ?? [])], query);

function fulfillSiteLabel(
  kind: StockRequestIngredientOption["fulfillSiteKind"],
): string {
  return kind === "central_supply"
    ? copy.sourceCentralSupply
    : copy.sourceCentralKitchen;
}

function toLocalDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function StockRequestEditor({
  branchId,
  requestId,
  ingredients,
  initialLines,
  initialStatus,
  initialNeededAt,
  initialNotes,
  copyFromRequestId = null,
  returnHref,
}: {
  branchId: number;
  requestId: number | null;
  ingredients: StockRequestIngredientOption[];
  initialLines: StockRequestEditorLine[];
  initialStatus: string | null;
  initialNeededAt: string | null;
  initialNotes: string | null;
  copyFromRequestId?: number | null;
  returnHref?: string;
}) {
  const router = useRouter();
  const isOnline = useIsOnline();
  const [isPending, startTransition] = useTransition();
  const [neededAt, setNeededAt] = useState(toLocalDateTime(initialNeededAt));
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [lines, setLines] = useState<DraftLine[]>(
    initialLines.length > 0
      ? initialLines.map((line) => ({
          key: String(line.id ?? crypto.randomUUID()),
          ingredientId: String(line.ingredientId),
          entryUnitId: String(line.entryUnitId),
          quantity: String(line.quantity),
        }))
      : [emptyLine()],
  );

  function patchLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function chooseIngredient(line: DraftLine, value: string) {
    const ingredient = ingredients.find((item) => item.id === Number(value));
    const defaultUnit =
      ingredient?.units.find((unit) => unit.isBase) ?? ingredient?.units[0];
    const shouldPrefill =
      line.quantity.trim() === "" || Number(line.quantity) <= 0;
    const suggested =
      ingredient != null && ingredient.suggestedOrderQty > 0
        ? String(ingredient.suggestedOrderQty)
        : line.quantity;
    patchLine(line.key, {
      ingredientId: value,
      entryUnitId: defaultUnit ? String(defaultUnit.id) : "",
      ...(shouldPrefill ? { quantity: suggested } : {}),
    });
  }

  function save(submit: boolean) {
    if (!isOnline) {
      toast.error(messages.inventory.stockRequests.journey.offlineMutation);
      return;
    }
    const shouldSubmit = submit || initialStatus === "submitted";
    const payload = lines.map((line) => ({
      ingredientId: Number(line.ingredientId),
      entryUnitId: Number(line.entryUnitId),
      quantity: Number(line.quantity),
    }));
    if (
      payload.some(
        (line) =>
          !Number.isInteger(line.ingredientId) ||
          !Number.isInteger(line.entryUnitId) ||
          !Number.isFinite(line.quantity) ||
          line.quantity <= 0,
      )
    ) {
      toast.error(copy.invalidLine);
      return;
    }
    if (
      new Set(payload.map((line) => line.ingredientId)).size !== payload.length
    ) {
      toast.error(copy.duplicateIngredient);
      return;
    }

    startTransition(async () => {
      const result = await saveStockRequest({
        branchId,
        requestId,
        neededAt: neededAt ? new Date(neededAt).toISOString() : null,
        notes,
        lines: payload,
        submit: shouldSubmit,
        idempotencyKey: requestId == null ? idempotencyKey : undefined,
      });
      if (!result.success || !result.data) {
        toast.error(
          applyInventoryActionError(result, copy.saveFailed).toastMessage,
        );
        return;
      }
      toast.success(shouldSubmit ? copy.submitSuccess : copy.draftSuccess);
      router.replace(
        returnHref
          ? returnHref.replace(":requestId", String(result.data.requestId))
          : `/br/${branchId}/stock/requests/${result.data.requestId}`,
      );
      router.refresh();
    });
  }

  return (
    <>
      {copyFromRequestId != null ? (
        <Item variant="muted" size="sm">
          {messages.inventory.stockRequests.branch.copyToNewBanner}
        </Item>
      ) : null}
      <AppSection title={copy.itemsTitle} description={copy.itemsDescription}>
        <div className="flex flex-col gap-3">
          {lines.map((line) => {
            const ingredient = ingredients.find(
              (item) => item.id === Number(line.ingredientId),
            );
            return (
              <Item
                key={line.key}
                variant="outline"
                className="flex-col items-stretch gap-3 p-3"
              >
                <ItemContent>
                  <ItemTitle>{copy.ingredient}</ItemTitle>
                </ItemContent>
                <Combobox
                  value={line.ingredientId}
                  onValueChange={(value) => chooseIngredient(line, value)}
                  options={ingredients.map((item) => ({
                    value: String(item.id),
                    label: item.name,
                    keywords: [
                      ...(item.sku ? [item.sku] : []),
                      fulfillSiteLabel(item.fulfillSiteKind),
                    ],
                    hint: copy.sourceHint(
                      fulfillSiteLabel(item.fulfillSiteKind),
                    ),
                  }))}
                  placeholder={copy.chooseIngredient}
                  searchPlaceholder={copy.searchIngredient}
                  emptyMessage={copy.ingredientNotFound}
                  filter={ingredientFilter}
                />
                {ingredient ? (
                  <Badge variant="secondary" className="w-fit">
                    {copy.sourceHint(
                      fulfillSiteLabel(ingredient.fulfillSiteKind),
                    )}
                  </Badge>
                ) : null}
                <div className="grid grid-cols-[minmax(0,1fr)_7rem_auto] gap-2">
                  <QuantityInput
                    value={line.quantity}
                    onValueChange={(quantity) =>
                      patchLine(line.key, { quantity })
                    }
                    maxFractionDigits={3}
                    placeholder={copy.quantity}
                    className="h-12"
                  />
                  <Select
                    value={line.entryUnitId}
                    onValueChange={(entryUnitId) =>
                      patchLine(line.key, { entryUnitId })
                    }
                  >
                    <SelectTrigger size="touch" aria-label={copy.unitAria}>
                      <SelectValue placeholder={copy.unitShort} />
                    </SelectTrigger>
                    <SelectContent>
                      {(ingredient?.units ?? []).map((unit) => (
                        <SelectItem key={unit.id} value={String(unit.id)}>
                          {unit.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="icon-touch"
                    variant="ghost"
                    aria-label={copy.removeLineAria}
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((item) => item.key !== line.key),
                      )
                    }
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </div>
              </Item>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="w-full border-dashed"
            onClick={() => setLines((current) => [...current, emptyLine()])}
          >
            <IconPlus data-icon="inline-start" />
            {copy.addIngredient}
          </Button>
        </div>
      </AppSection>

      <AppSection title={copy.extraTitle}>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="stock-request-needed-at">{copy.neededAt}</Label>
            <Input
              id="stock-request-needed-at"
              type="datetime-local"
              value={neededAt}
              onChange={(event) => setNeededAt(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="stock-request-notes">{copy.notes}</Label>
            <Textarea
              id="stock-request-notes"
              value={notes}
              maxLength={500}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={copy.notesPlaceholder}
            />
          </div>
        </div>
      </AppSection>

      <AppDetailFooter
        sticky
        leading={
          initialStatus === "submitted" ? null : (
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={isPending || !isOnline}
              onClick={() => save(false)}
            >
              {copy.saveDraft}
            </Button>
          )
        }
        trailing={
          <Button
            type="button"
            size="touch"
            disabled={isPending || !isOnline}
            onClick={() => save(true)}
          >
            {copy.submit}
          </Button>
        }
      />
    </>
  );
}
