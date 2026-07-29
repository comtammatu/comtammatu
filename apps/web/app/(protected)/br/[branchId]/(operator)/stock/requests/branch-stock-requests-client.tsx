"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Pencil as IconPencil,
  Plus as IconPlus,
  Trash as IconTrash,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Combobox } from "@comtammatu/ui/components/combobox";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { ReasonConfirmDialog } from "@comtammatu/ui/components/reason-confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppEmptyState } from "@/components/surface";
import { FormattedNumberInput } from "@/components/form";
import { messages } from "@lib/messages";
import {
  cancelStockRequest,
  saveStockRequest,
} from "@/(protected)/inventory/stock-request-actions";

type IngredientOption = {
  id: number;
  name: string;
  sku: string | null;
  units: Array<{ id: number; label: string; isBase: boolean }>;
};

type RequestLine = {
  id: number;
  ingredientId: number;
  ingredientName: string;
  entryUnitId: number;
  unitLabel: string;
  quantity: number;
};

export type BranchStockRequestRow = {
  id: number;
  code: string;
  status: string;
  createdAt: string;
  items: RequestLine[];
};

type DraftLine = {
  key: string;
  ingredientId: string;
  entryUnitId: string;
  quantity: string;
};

const copy = messages.inventory.stockRequests;
const branchCopy = copy.branch;
const comboFilter = (
  option: { label: string; keywords?: string[] },
  query: string,
) =>
  [option.label, ...(option.keywords ?? [])].some((value) =>
    value.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")),
  );
const emptyLine = (): DraftLine => ({
  key: crypto.randomUUID(),
  ingredientId: "",
  entryUnitId: "",
  quantity: "",
});

export function BranchStockRequestsClient({
  branchId,
  rows,
  ingredients,
}: {
  branchId: number;
  rows: BranchStockRequestRow[];
  ingredients: IngredientOption[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [baseline, setBaseline] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [cancelRow, setCancelRow] = useState<BranchStockRequestRow>();
  const [cancelReason, setCancelReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const rawRequestId = Number(searchParams.get("requestId"));
  const requestId =
    Number.isInteger(rawRequestId) && rawRequestId > 0 ? rawRequestId : null;
  const mode = searchParams.get("mode");
  const selected = rows.find((row) => row.id === requestId) ?? null;
  const editing = mode === "create" || mode === "edit";
  const open = mode === "create" || selected != null;

  function snapshot(next = lines) {
    return JSON.stringify(
      next.map(({ ingredientId, entryUnitId, quantity }) => ({
        ingredientId,
        entryUnitId,
        quantity,
      })),
    );
  }

  function updateUrl(
    nextRequestId: number | null,
    nextMode: "create" | "view" | "edit" | null,
    method: "push" | "replace" = "push",
  ) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextRequestId == null) params.delete("requestId");
    else params.set("requestId", String(nextRequestId));
    if (nextMode == null) params.delete("mode");
    else params.set("mode", nextMode);
    router[method](params.size > 0 ? `${pathname}?${params}` : pathname, {
      scroll: false,
    });
  }

  function resetCreate() {
    const next = [emptyLine()];
    setLines(next);
    setBaseline(snapshot(next));
    setIdempotencyKey(crypto.randomUUID());
  }

  function openCreate() {
    resetCreate();
    updateUrl(null, "create");
  }

  function openRequest(row: BranchStockRequestRow) {
    updateUrl(row.id, "view");
  }

  function openEdit(row: BranchStockRequestRow) {
    const next = row.items.map((item) => ({
      key: String(item.id),
      ingredientId: String(item.ingredientId),
      entryUnitId: String(item.entryUnitId),
      quantity: String(item.quantity),
    }));
    setLines(next);
    setBaseline(snapshot(next));
    updateUrl(row.id, "edit", "replace");
  }

  useEffect(() => {
    if (mode !== "edit" || !selected) return;
    const next = selected.items.map((item) => ({
      key: String(item.id),
      ingredientId: String(item.ingredientId),
      entryUnitId: String(item.entryUnitId),
      quantity: String(item.quantity),
    }));
    setLines(next);
    setBaseline(snapshot(next));
  }, [mode, selected]);

  async function closeSheet() {
    if (
      editing &&
      baseline &&
      snapshot() !== baseline &&
      !(await confirm({
        title: messages.common.unsavedChangesTitle,
        description: messages.common.unsavedChangesDescription,
        variant: "destructive",
      }))
    ) {
      return;
    }
    updateUrl(null, null, "replace");
  }

  function patchLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function chooseIngredient(line: DraftLine, value: string) {
    const ingredient = ingredients.find((item) => item.id === Number(value));
    const defaultUnit =
      ingredient?.units.find((unit) => unit.isBase) ?? ingredient?.units[0];
    patchLine(line.key, {
      ingredientId: value,
      entryUnitId: defaultUnit ? String(defaultUnit.id) : "",
    });
  }

  function save(submit: boolean) {
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
      toast.error(branchCopy.invalidLine);
      return;
    }
    if (new Set(payload.map((line) => line.ingredientId)).size !== payload.length) {
      toast.error(branchCopy.duplicateIngredient);
      return;
    }

    startTransition(async () => {
      const result = await saveStockRequest({
        branchId,
        requestId: mode === "edit" ? selected?.id : null,
        lines: payload,
        submit,
        idempotencyKey: mode === "create" ? idempotencyKey : undefined,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? branchCopy.saveFailed);
        return;
      }
      toast.success(
        submit ? branchCopy.submittedToast : branchCopy.draftSavedToast,
      );
      updateUrl(result.data.requestId, "view", "replace");
      setIdempotencyKey(crypto.randomUUID());
      router.refresh();
    });
  }

  function cancelRequest() {
    if (!cancelRow) return;
    startTransition(async () => {
      const result = await cancelStockRequest({
        branchId,
        requestId: cancelRow.id,
        reason: cancelReason,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(branchCopy.cancelledToast);
      setCancelRow(undefined);
      setCancelReason("");
      updateUrl(null, null, "replace");
      router.refresh();
    });
  }

  const selectedCanEdit =
    selected != null &&
    (selected.status === "draft" || selected.status === "submitted");

  return (
    <>
      <div className="mb-4">
        <Button type="button" size="touch" onClick={openCreate}>
          <IconPlus data-icon="inline-start" />
          {branchCopy.createAction}
        </Button>
      </div>

      {rows.length === 0 ? (
        <AppEmptyState
          title={branchCopy.emptyTitle}
          description={branchCopy.emptyDescription}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="w-full justify-between"
                onClick={() => openRequest(row)}
              >
                <span>{row.code}</span>
                <span className="text-muted-foreground">
                  {copy.statusLabel(row.status)}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) void closeSheet();
        }}
      >
        <SheetContent side="bottom" fullscreen>
          <SheetHeader>
            <SheetTitle>
              {mode === "create"
                ? branchCopy.createTitle
                : selected?.code ?? branchCopy.titleFallback}
            </SheetTitle>
            <SheetDescription>
              {mode === "create"
                ? branchCopy.createDescription
                : copy.statusLabel(selected?.status ?? "")}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
            {editing ? (
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
                      <Combobox
                        value={line.ingredientId}
                        onValueChange={(value) => chooseIngredient(line, value)}
                        options={ingredients.map((item) => ({
                          value: String(item.id),
                          label: item.name,
                          keywords: item.sku ? [item.sku] : undefined,
                        }))}
                        placeholder={branchCopy.ingredientPlaceholder}
                        searchPlaceholder={branchCopy.ingredientSearchPlaceholder}
                        emptyMessage={branchCopy.ingredientEmpty}
                        filter={comboFilter}
                      />
                      <div className="grid grid-cols-[minmax(0,1fr)_7rem_auto] gap-2">
                        <FormattedNumberInput
                          value={line.quantity}
                          onValueChange={(quantity) =>
                            patchLine(line.key, { quantity })
                          }
                          maxFractionDigits={3}
                          placeholder={branchCopy.quantityPlaceholder}
                          className="h-12"
                        />
                        <Select
                          value={line.entryUnitId}
                          onValueChange={(entryUnitId) =>
                            patchLine(line.key, { entryUnitId })
                          }
                        >
                          <SelectTrigger size="touch">
                            <SelectValue placeholder={branchCopy.unitPlaceholder} />
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
                          aria-label={branchCopy.removeLineAria}
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
                  {branchCopy.addIngredient}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {(selected?.items ?? []).map((line) => (
                  <Item key={line.id} variant="outline" size="sm">
                    <ItemContent>
                      <ItemTitle>{line.ingredientName}</ItemTitle>
                      <ItemDescription>
                        {line.quantity} {line.unitLabel}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions />
                  </Item>
                ))}
              </div>
            )}
          </div>

          <SheetFooter className="sm:flex-row sm:items-center sm:justify-between">
            {editing ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  disabled={isPending}
                  onClick={() => save(false)}
                >
                  {branchCopy.saveDraft}
                </Button>
                <Button
                  type="button"
                  size="touch"
                  disabled={isPending}
                  onClick={() => save(true)}
                >
                  {branchCopy.createAction}
                </Button>
              </>
            ) : selectedCanEdit ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  size="touch"
                  disabled={isPending}
                  onClick={() => setCancelRow(selected)}
                >
                  {branchCopy.cancel}
                </Button>
                <Button
                  type="button"
                  size="touch"
                  disabled={isPending}
                  onClick={() => openEdit(selected)}
                >
                  <IconPencil data-icon="inline-start" />
                  {branchCopy.edit}
                </Button>
              </>
            ) : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ReasonConfirmDialog
        open={cancelRow != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setCancelRow(undefined);
            setCancelReason("");
          }
        }}
        title={branchCopy.cancelTitle}
        description={branchCopy.cancelDescription}
        reasonId="branch-stock-request-cancel-reason"
        reason={cancelReason}
        onReasonChange={setCancelReason}
        reasonLabel={branchCopy.reasonLabel}
        reasonPlaceholder={branchCopy.reasonPlaceholder}
        cancelLabel={branchCopy.backAction}
        confirmLabel={branchCopy.cancel}
        onConfirm={cancelRequest}
        isPending={isPending}
      />
    </>
  );
}
