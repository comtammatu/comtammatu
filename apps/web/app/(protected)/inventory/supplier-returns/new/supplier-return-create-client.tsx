"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Search as IconSearch,
  Trash as IconTrash,
  TriangleAlert as IconAlertTriangle,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { ItemGroup } from "@comtammatu/ui/components/item";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import { formatVND } from "@comtammatu/shared/format";
import { SearchableSelect } from "@/(protected)/inventory/_components/searchable-select";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { NumberPadSheet } from "@/components/form";
import { AppEmptyState } from "@/components/surface";
import {
  createSupplierReturnFromGrn,
  createSupplierReturnFromStock,
  type ReturnableGrnRow,
} from "@/(protected)/inventory/supplier-return-actions";

const COPY = messages.inventory.supplierReturns;
const CREATE = COPY.create;

type SupplierOption = { id: number; name: string };
type IngredientOption = {
  id: number;
  name: string;
  unit: string;
  unitCost: number | null;
};

type StockLine = {
  ingredientId: number;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  reasonDetail: string;
};

type Mode = "grn" | "stock";
type NumpadTarget = { ingredientId: number; field: "qty" | "cost" } | null;

const RESOLUTIONS = ["replacement", "credit_note", "cash_refund"] as const;
const REASONS = [
  "damaged",
  "wrong_item",
  "expired",
  "quality_fail",
  "short_delivery_credit",
  "other",
] as const;

type Resolution = (typeof RESOLUTIONS)[number];
type Reason = (typeof REASONS)[number];

interface Props {
  returnableGrns: ReturnableGrnRow[];
  suppliers: SupplierOption[];
  ingredients: IngredientOption[];
  branchId: number;
  detailBasePath: string;
  successBasePath: string;
}

export function SupplierReturnCreateClient({
  returnableGrns,
  suppliers,
  ingredients,
  branchId,
  detailBasePath,
  successBasePath,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>(
    returnableGrns.length > 0 ? "grn" : "stock",
  );
  const [resolution, setResolution] = React.useState<Resolution>("credit_note");
  const [reason, setReason] = React.useState<Reason>("damaged");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // from-GRN state
  const [grnId, setGrnId] = React.useState<string>("");

  // from-stock state
  const [supplierId, setSupplierId] = React.useState<string>("");
  const [query, setQuery] = React.useState("");
  const [lines, setLines] = React.useState<StockLine[]>([]);
  const [numpad, setNumpad] = React.useState<NumpadTarget>(null);

  const grnOptions = React.useMemo(
    () =>
      returnableGrns.map((g) => ({
        value: String(g.id),
        label: `${g.grn_number} · ${g.supplier_name} · ${CREATE.grnRejectedLines(g.rejected_lines)}`,
      })),
    [returnableGrns],
  );

  const supplierOptions = React.useMemo(
    () => suppliers.map((s) => ({ value: String(s.id), label: s.name })),
    [suppliers],
  );

  const addedMap = React.useMemo(() => {
    const map = new Map<number, StockLine>();
    lines.forEach((l) => map.set(l.ingredientId, l));
    return map;
  }, [lines]);

  const filteredIngredients = React.useMemo(() => {
    const needle = query.trim();
    if (!needle) return ingredients;
    return ingredients.filter((i) => matchesSearch([i.name], needle));
  }, [query, ingredients]);

  const numpadLine = React.useMemo(
    () =>
      numpad
        ? (lines.find((l) => l.ingredientId === numpad.ingredientId) ?? null)
        : null,
    [numpad, lines],
  );

  function resolutionLabel(value: Resolution) {
    return COPY.resolutionLabels[value];
  }
  function reasonLabel(value: Reason) {
    return COPY.reasonLabels[value];
  }

  function addIngredient(ing: IngredientOption) {
    if (addedMap.has(ing.id)) {
      setNumpad({ ingredientId: ing.id, field: "qty" });
      return;
    }
    setLines((current) => [
      ...current,
      {
        ingredientId: ing.id,
        name: ing.name,
        unit: ing.unit,
        quantity: 1,
        unitCost: ing.unitCost ?? 0,
        reasonDetail: "",
      },
    ]);
    setNumpad({ ingredientId: ing.id, field: "qty" });
  }

  function removeLine(ingredientId: number) {
    setLines((current) =>
      current.filter((l) => l.ingredientId !== ingredientId),
    );
  }

  function patchLine(ingredientId: number, patch: Partial<StockLine>) {
    setLines((current) =>
      current.map((l) =>
        l.ingredientId === ingredientId ? { ...l, ...patch } : l,
      ),
    );
  }

  async function submitFromGrn() {
    if (!grnId) {
      setSubmitError(CREATE.submitDisabledGrn);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await createSupplierReturnFromGrn({
        grnId: Number(grnId),
        resolution,
        reason,
        notes: notes.trim() || undefined,
      });
      if (!res.success) {
        setSubmitError(res.error ?? CREATE.createFailed);
        toast.error(res.error ?? CREATE.createFailed);
        return;
      }
      toast.success(CREATE.createdOk);
      const id = res.data?.id;
      router.push(id != null ? `${detailBasePath}/${id}` : successBasePath);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function submitFromStock() {
    if (!supplierId) {
      setSubmitError(CREATE.needSupplier);
      return;
    }
    if (lines.length === 0) {
      setSubmitError(CREATE.submitDisabledStock);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await createSupplierReturnFromStock({
        branchId,
        supplierId: Number(supplierId),
        resolution,
        reason,
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({
          ingredient_id: l.ingredientId,
          quantity: l.quantity,
          unit_cost: l.unitCost,
          reason_detail: l.reasonDetail.trim() || undefined,
        })),
      });
      if (!res.success) {
        setSubmitError(res.error ?? CREATE.createFailed);
        toast.error(res.error ?? CREATE.createFailed);
        return;
      }
      toast.success(CREATE.createdOk);
      const id = res.data?.id;
      router.push(id != null ? `${detailBasePath}/${id}` : successBasePath);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmitGrn = grnId !== "" && !submitting;
  const canSubmitStock = supplierId !== "" && lines.length > 0 && !submitting;

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Mode toggle */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {CREATE.sourceLabel}
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={mode === "grn" ? "default" : "outline"}
            size="touch"
            onClick={() => {
              setMode("grn");
              setSubmitError(null);
            }}
            disabled={returnableGrns.length === 0}
          >
            {CREATE.sourceGrn}
          </Button>
          <Button
            type="button"
            variant={mode === "stock" ? "default" : "outline"}
            size="touch"
            onClick={() => {
              setMode("stock");
              setSubmitError(null);
            }}
          >
            {CREATE.sourceStock}
          </Button>
        </div>
      </div>

      {mode === "grn" ? (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {CREATE.grnPickerLabel}
          </Label>
          <SearchableSelect
            options={grnOptions}
            value={grnId}
            onValueChange={setGrnId}
            placeholder={CREATE.grnPickerPlaceholder}
            searchPlaceholder={CREATE.grnPickerSearch}
            emptyText={CREATE.grnPickerEmpty}
          />
          <NoteCallout tone="muted">{CREATE.grnAutoLinesHint}</NoteCallout>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {CREATE.supplierLabel}
          </Label>
          <SearchableSelect
            options={supplierOptions}
            value={supplierId}
            onValueChange={setSupplierId}
            placeholder={CREATE.supplierPlaceholder}
            searchPlaceholder={CREATE.supplierSearch}
            emptyText={CREATE.supplierEmpty}
          />
        </div>
      )}

      {/* Resolution + reason */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {CREATE.resolutionLabel}
          </Label>
          <Select
            value={resolution}
            onValueChange={(v) => setResolution(v as Resolution)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESOLUTIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {resolutionLabel(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {CREATE.reasonLabel}
          </Label>
          <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {reasonLabel(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* from-stock line editor */}
      {mode === "stock" ? (
        <div className="flex flex-col gap-3">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {CREATE.addItemsTitle}
          </Label>

          {lines.length > 0 ? (
            <ItemGroup className="gap-2">
              {lines.map((line) => (
                <InteractiveCard
                  key={line.ingredientId}
                  padding="compact"
                  minHeight="tap"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {CREATE.lineDetail(
                        line.quantity,
                        line.unit,
                        `${formatVND(line.unitCost)}/${line.unit}`,
                      )}{" "}
                      <span className="font-medium text-foreground">
                        {formatVND(line.quantity * line.unitCost)}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="font-mono tabular-nums"
                      onClick={() =>
                        setNumpad({
                          ingredientId: line.ingredientId,
                          field: "qty",
                        })
                      }
                      aria-label={CREATE.editLineAria}
                    >
                      {line.quantity} {line.unit}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="font-mono tabular-nums"
                      onClick={() =>
                        setNumpad({
                          ingredientId: line.ingredientId,
                          field: "cost",
                        })
                      }
                      aria-label={CREATE.lineCostTitle}
                    >
                      {formatVND(line.unitCost)}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-lg"
                      className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => removeLine(line.ingredientId)}
                      aria-label={CREATE.removeLineAria}
                    >
                      <IconTrash className="size-4" />
                    </Button>
                  </div>
                </InteractiveCard>
              ))}
            </ItemGroup>
          ) : null}

          <InputGroup className="h-12 rounded-lg">
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={CREATE.searchIngredient}
              className="text-base"
              inputMode="search"
            />
          </InputGroup>

          <div className="flex flex-col gap-2">
            {filteredIngredients.length === 0 ? (
              <AppEmptyState
                compact
                icon={<IconSearch />}
                title={CREATE.ingredientEmptyTitle}
                description={CREATE.ingredientEmptyDescription}
              />
            ) : (
              filteredIngredients.slice(0, 30).map((ing) => (
                <InteractiveCard
                  key={ing.id}
                  asChild
                  padding="compact"
                  minHeight="tap"
                >
                  <button
                    type="button"
                    onClick={() => addIngredient(ing)}
                    className="w-full text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{ing.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {ing.unit}
                        {ing.unitCost != null
                          ? ` · ~${formatVND(ing.unitCost)}`
                          : ""}
                      </p>
                    </div>
                    {addedMap.has(ing.id) ? (
                      <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                        {addedMap.get(ing.id)?.quantity}
                      </span>
                    ) : null}
                  </button>
                </InteractiveCard>
              ))
            )}
          </div>
        </div>
      ) : null}

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="return-notes"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          {CREATE.notesLabel}
        </Label>
        <Textarea
          id="return-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder={CREATE.notesPlaceholder}
        />
      </div>

      {submitError ? (
        <Alert variant="destructive">
          <IconAlertTriangle className="size-4" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}

      {/* Sticky submit */}
      <div className="sticky chrome-safe-bottom z-10 w-full">
        {mode === "grn" ? (
          <Button
            type="button"
            size="touch-lg"
            className="w-full"
            onClick={submitFromGrn}
            disabled={!canSubmitGrn}
          >
            {submitting ? <Spinner className="size-5" /> : null}
            {grnId === "" ? CREATE.submitDisabledGrn : CREATE.submitFromGrn}
          </Button>
        ) : (
          <Button
            type="button"
            size="touch-lg"
            className="w-full"
            onClick={submitFromStock}
            disabled={!canSubmitStock}
          >
            {submitting ? <Spinner className="size-5" /> : null}
            {lines.length === 0
              ? CREATE.submitDisabledStock
              : CREATE.submitFromStock(lines.length)}
          </Button>
        )}
      </div>

      {/* Number pad drawer for stock-line qty / cost */}
      <NumberPadSheet
        open={numpad?.field === "qty"}
        onOpenChange={(next) => {
          if (!next) setNumpad(null);
        }}
        title={CREATE.lineQuantityTitle(numpadLine?.unit ?? "")}
        suffix={numpadLine?.unit}
        initialValue={numpadLine?.quantity ?? 0}
        onConfirm={(value) => {
          if (numpad) patchLine(numpad.ingredientId, { quantity: value });
        }}
        allowDecimal
      />
      <NumberPadSheet
        open={numpad?.field === "cost"}
        onOpenChange={(next) => {
          if (!next) setNumpad(null);
        }}
        title={CREATE.lineCostTitle}
        suffix="đ"
        initialValue={numpadLine?.unitCost ?? 0}
        onConfirm={(value) => {
          if (numpad) patchLine(numpad.ingredientId, { unitCost: value });
        }}
        allowDecimal={false}
      />
    </div>
  );
}
