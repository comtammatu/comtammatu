"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft as IconArrowLeft,
  Lightbulb as IconBulb,
  Package as IconPackage,
  Plus as IconPlus,
  CirclePlus as IconCirclePlus,
  Trash as IconTrash,
  TrendingDown as IconTrendingDown,
  TrendingUp as IconTrendingUp,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { toast } from "@comtammatu/ui/components/sonner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { cn } from "@comtammatu/ui";
import { Combobox, NumberPadSheet } from "@/components/form";
import { formatVND } from "../../_lib/format";
import {
  getDefaultPurchaseUnit,
  getPurchaseUnitOptions,
  type PurchaseUnitOption,
} from "../../_lib/purchase-units";
import {
  AppEmptyState,
  AppPageHeader,
  AppSection,
  DocumentFormFrame,
} from "@/components/surface";
import {
  createPurchaseOrderWithLines,
  fetchPoSuggestions,
  fetchSinglePriceDeviation,
} from "../../procurement-actions";
import type {
  PoSuggestionRow,
  SinglePriceDeviation,
} from "../../procurement-actions";
import type { SupplierRow } from "../../suppliers/suppliers-client";
import type { IngredientRow } from "../../page";
import { messages } from "@lib/messages";

import {
  ACTIONS_VI,
  FORM_VI,
  PRODUCT_VI,
  STATES_VI,
} from "@comtammatu/shared/messages";
interface LocalLine {
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  unit: string;
  entryUnitId: number | null;
  unitPriceEst: number | null;
}

export interface ProcurementBranchOption {
  id: number;
  name: string;
  branch_kind: string;
}

export function NewPoClient({
  suppliers,
  ingredients,
  initialSuggestions,
  procurementBranches,
  initialBranchId,
  canSwitchBranch,
  poBasePath = "/inventory/purchase-orders",
  embedded = false,
}: {
  suppliers: SupplierRow[];
  ingredients: IngredientRow[];
  initialSuggestions: PoSuggestionRow[];
  procurementBranches: ProcurementBranchOption[];
  initialBranchId: number | null;
  canSwitchBranch: boolean;
  poBasePath?: string;
  embedded?: boolean;
}) {
  const router = useRouter();

  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LocalLine[]>([]);
  const [isPending, startTransition] = useTransition();

  // Suggestions state — scoped to a selected branch.
  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [suggestions, setSuggestions] =
    useState<PoSuggestionRow[]>(initialSuggestions);
  const [periodDays, setPeriodDays] = useState<7 | 14 | 30>(7);
  const [isLoadingSuggestions, startSuggestionsTransition] = useTransition();

  // Price deviation state
  const [lineDeviations, setLineDeviations] = useState<
    Map<number, SinglePriceDeviation>
  >(new Map());

  const lineIngredientIds = new Set(lines.map((l) => l.ingredientId));

  // Sort suggestions: below reorder point first, then by name
  const sortedSuggestions = [...suggestions].sort((a, b) => {
    if (a.below_reorder !== b.below_reorder) return a.below_reorder ? -1 : 1;
    return a.ingredient_name.localeCompare(b.ingredient_name, "vi");
  });

  function checkPriceDeviation(
    ingId: number,
    price: number,
    target: "line" | "addRow",
  ) {
    if (!supplierId || price <= 0) return;
    fetchSinglePriceDeviation({
      ingredientId: ingId,
      supplierId: Number(supplierId),
      currentPrice: price,
    }).then((res) => {
      if (!res.success) return;
      const dev = res.data as SinglePriceDeviation | null;
      if (target === "line" && dev) {
        setLineDeviations((prev) => {
          const next = new Map(prev);
          next.set(ingId, dev);
          return next;
        });
      }
    });
  }

  function refreshSuggestions(
    nextBranchId: number | null,
    nextPeriod: 7 | 14 | 30,
  ) {
    if (!nextBranchId) {
      setSuggestions([]);
      return;
    }
    startSuggestionsTransition(async () => {
      const res = await fetchPoSuggestions({
        branchId: nextBranchId,
        periodDays: nextPeriod,
      });
      if (res.success) {
        setSuggestions((res.data ?? []) as PoSuggestionRow[]);
      } else {
        toast.error(res.error ?? "Không thể tải gợi ý.");
      }
    });
  }

  function handlePeriodChange(val: string) {
    const days = Number(val) as 7 | 14 | 30;
    setPeriodDays(days);
    refreshSuggestions(branchId, days);
  }

  function handleBranchChange(val: string) {
    const nextId = Number(val) || null;
    setBranchId(nextId);
    refreshSuggestions(nextId, periodDays);
  }

  function addSuggestionToLines(s: PoSuggestionRow) {
    if (lineIngredientIds.has(s.ingredient_id)) {
      toast.info(`${s.ingredient_name} đã có trong PO`);
      return;
    }
    const ing = ingredients.find((x) => x.id === s.ingredient_id);
    const defaultUnit = getDefaultPurchaseUnit(ing);
    setLines((prev) => [
      ...prev,
      {
        ingredientId: s.ingredient_id,
        ingredientName: s.ingredient_name,
        quantity: s.suggested_qty,
        unit: defaultUnit?.label ?? s.unit,
        entryUnitId: defaultUnit?.unitId ?? null,
        unitPriceEst: ing?.unit_cost ?? null,
      },
    ]);
    toast.success(`Đã thêm ${s.ingredient_name}`);
  }

  function addAllSuggestions() {
    const toAdd = sortedSuggestions.filter(
      (s) => !lineIngredientIds.has(s.ingredient_id) && s.suggested_qty > 0,
    );
    if (toAdd.length === 0) {
      toast.info("Không có gợi ý nào để thêm");
      return;
    }
    setLines((prev) => [
      ...prev,
      ...toAdd.map((s) => {
        const ing = ingredients.find((x) => x.id === s.ingredient_id);
        const defaultUnit = getDefaultPurchaseUnit(ing);
        return {
          ingredientId: s.ingredient_id,
          ingredientName: s.ingredient_name,
          quantity: s.suggested_qty,
          unit: defaultUnit?.label ?? s.unit,
          entryUnitId: defaultUnit?.unitId ?? null,
          unitPriceEst: ing?.unit_cost ?? null,
        };
      }),
    ]);
    toast.success(`Đã thêm ${toAdd.length} nguyên liệu`);
  }

  function removeLine(idx: number) {
    setLines((prev) => {
      const removed = prev[idx];
      if (removed) {
        setLineDeviations((m) => {
          const next = new Map(m);
          next.delete(removed.ingredientId);
          return next;
        });
      }
      return prev.filter((_, i) => i !== idx);
    });
  }

  function submit() {
    if (!supplierId) {
      toast.error("Chọn nhà cung cấp");
      return;
    }
    if (!branchId) {
      toast.error("Chọn kho nhận hàng");
      return;
    }
    if (lines.length === 0) {
      toast.error("Thêm ít nhất 1 nguyên liệu");
      return;
    }
    startTransition(async () => {
      const res = await createPurchaseOrderWithLines({
        supplierId: Number(supplierId),
        branchId,
        notes: notes || undefined,
        lines: lines.map((l) => ({
          ingredientId: l.ingredientId,
          quantity: l.quantity,
          entryUnitId: l.entryUnitId,
          unitPriceEst: l.unitPriceEst,
        })),
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không tạo được PO");
        return;
      }
      const poId = (res.data as { id: number }).id;
      toast.success("Đã tạo đơn đặt hàng");
      router.push(`${poBasePath}/${poId}?branchId=${branchId}`);
    });
  }

  const totalValue = lines.reduce(
    (sum, l) =>
      sum + (l.unitPriceEst != null ? l.quantity * l.unitPriceEst : 0),
    0,
  );
  const hasValue = lines.some((l) => l.unitPriceEst != null);

  const addableCount = sortedSuggestions.filter(
    (s) => !lineIngredientIds.has(s.ingredient_id) && s.suggested_qty > 0,
  ).length;

  const header = (
    <AppPageHeader
      eyebrow={messages.inventory.po.draftEyebrow}
      title={messages.inventory.po.newTitle}
      description={messages.inventory.po.draftDescription}
      breadcrumb={
        <Link
          href={poBasePath}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <IconArrowLeft className="size-4" />
          {messages.inventory.po.list}
        </Link>
      }
    />
  );

  const body = (
    <>
      <SupplierSection
        suppliers={suppliers}
        supplierId={supplierId}
        onSupplierChange={setSupplierId}
        notes={notes}
        onNotesChange={setNotes}
      />
      <SuggestionsPanel
        suggestions={sortedSuggestions}
        periodDays={periodDays}
        onPeriodChange={handlePeriodChange}
        isLoading={isLoadingSuggestions}
        addableCount={addableCount}
        lineIngredientIds={lineIngredientIds}
        onAddSuggestion={addSuggestionToLines}
        onAddAll={addAllSuggestions}
        procurementBranches={procurementBranches}
        branchId={branchId}
        onBranchChange={handleBranchChange}
        canSwitchBranch={canSwitchBranch}
      />
      <LineItemsSection
        lines={lines}
        lineDeviations={lineDeviations}
        ingredients={ingredients}
        supplierId={supplierId}
        totalValue={totalValue}
        hasValue={hasValue}
        onRemoveLine={removeLine}
        onAddLine={(line) => {
          if (lines.some((l) => l.ingredientId === line.ingredientId)) {
            toast.error("Nguyên liệu đã có trong danh sách");
            return;
          }
          setLines((prev) => [...prev, line]);
          if (line.unitPriceEst != null && line.unitPriceEst > 0) {
            checkPriceDeviation(line.ingredientId, line.unitPriceEst, "line");
          }
        }}
      />
    </>
  );

  const footer = (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Button variant="ghost" asChild>
        <Link
          href={branchId ? `${poBasePath}?branchId=${branchId}` : poBasePath}
        >
          {ACTIONS_VI.cancel}
        </Link>
      </Button>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
        {lines.length > 0 && (
          <span className="text-sm text-muted-foreground sm:text-right">
            {messages.inventory.po.lineCount(lines.length)}
            {hasValue
              ? messages.inventory.po.totalAmountSuffix(
                  totalValue.toLocaleString("vi-VN"),
                )
              : ""}
          </span>
        )}
        <Button
          onClick={submit}
          disabled={isPending || !supplierId || lines.length === 0}
        >
          {isPending
            ? messages.inventory.po.creating
            : messages.inventory.po.createPo}
        </Button>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="flex w-full flex-col gap-3">
        <div className="flex flex-col gap-3">{body}</div>
        <div className="sticky chrome-safe-bottom z-10 border-t bg-background/95 p-2 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          {footer}
        </div>
      </div>
    );
  }

  return (
    <DocumentFormFrame
      header={header}
      width="default"
      density="compact"
      footer={footer}
    >
      {body}
    </DocumentFormFrame>
  );
}

// ---------------------------------------------------------------------------
// SupplierSection
// ---------------------------------------------------------------------------
function SupplierSection({
  suppliers,
  supplierId,
  onSupplierChange,
  notes,
  onNotesChange,
}: {
  suppliers: SupplierRow[];
  supplierId: string;
  onSupplierChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
}) {
  return (
    <AppSection
      title={messages.inventory.po.headerInfoTitle}
      description={messages.inventory.po.headerInfoDescription}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>
            {messages.inventory.po.supplierRequired}{" "}
            <span className="text-destructive">*</span>
          </Label>
          <Combobox
            value={supplierId}
            onValueChange={onSupplierChange}
            options={suppliers.map((s) => ({
              value: String(s.id),
              label: s.name,
            }))}
            placeholder={messages.inventory.po.supplierPlaceholder}
            searchPlaceholder={messages.inventory.po.supplierSearchPlaceholder}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">{FORM_VI.notes}</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={3}
            placeholder={messages.inventory.po.notesPlaceholder}
            className="min-h-24"
          />
        </div>
      </div>
    </AppSection>
  );
}

// ---------------------------------------------------------------------------
// SuggestionsPanel
// ---------------------------------------------------------------------------
function SuggestionsPanel({
  suggestions,
  periodDays,
  onPeriodChange,
  isLoading,
  addableCount,
  lineIngredientIds,
  onAddSuggestion,
  onAddAll,
  procurementBranches,
  branchId,
  onBranchChange,
  canSwitchBranch,
}: {
  suggestions: PoSuggestionRow[];
  periodDays: number;
  onPeriodChange: (val: string) => void;
  isLoading: boolean;
  addableCount: number;
  lineIngredientIds: Set<number>;
  onAddSuggestion: (s: PoSuggestionRow) => void;
  onAddAll: () => void;
  procurementBranches: ProcurementBranchOption[];
  branchId: number | null;
  onBranchChange: (val: string) => void;
  canSwitchBranch: boolean;
}) {
  const branchLabel =
    procurementBranches.find((b) => b.id === branchId)?.name ?? "Chưa chọn";
  const showBranchSwitcher = canSwitchBranch && procurementBranches.length > 1;
  return (
    <AppSection
      tone="info"
      title={messages.inventory.po.suggestionsTitle}
      icon={<IconBulb />}
      badge={
        suggestions.length > 0
          ? { children: suggestions.length, variant: "info" }
          : undefined
      }
      action={
        addableCount > 0 ? (
          <Button variant="outline" size="sm" onClick={onAddAll}>
            <IconCirclePlus data-icon="inline-start" />
            {messages.inventory.po.addAll(addableCount)}
          </Button>
        ) : null
      }
      collapsible
      defaultOpen={suggestions.length > 0}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {messages.inventory.po.warehouseShort}
        </span>
        {showBranchSwitcher ? (
          <Select
            value={branchId ? String(branchId) : ""}
            onValueChange={onBranchChange}
            disabled={isLoading}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {procurementBranches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs font-medium">{branchLabel}</span>
        )}
        <span className="text-xs text-muted-foreground">/</span>
        <span className="text-xs text-muted-foreground">
          {messages.inventory.po.averageConsumption}
        </span>
        <Select
          value={String(periodDays)}
          onValueChange={onPeriodChange}
          disabled={isLoading}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">{messages.inventory.po.sevenDays}</SelectItem>
            <SelectItem value="14">
              {messages.inventory.po.fourteenDays}
            </SelectItem>
            <SelectItem value="30">
              {messages.inventory.po.thirtyDays}
            </SelectItem>
          </SelectContent>
        </Select>
        {isLoading ? (
          <span className="text-xs text-muted-foreground">
            {STATES_VI.loading}
          </span>
        ) : null}
      </div>

      {suggestions.length === 0 ? (
        <AppEmptyState
          compact
          title={messages.inventory.po.stableStockTitle}
          description={messages.inventory.po.stableStockDescription}
          icon={<IconPackage />}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {suggestions.map((s) => {
            const alreadyAdded = lineIngredientIds.has(s.ingredient_id);
            return (
              <Item
                key={s.ingredient_id}
                variant="outline"
                size="sm"
                className={cn(
                  "justify-between",
                  alreadyAdded
                    ? "bg-muted/30 opacity-60"
                    : "bg-background/70 hover:bg-info/5",
                )}
              >
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full">
                    <span className="truncate">{s.ingredient_name}</span>
                    {s.below_reorder ? (
                      <Badge variant="destructive">
                        {messages.inventory.po.low}
                      </Badge>
                    ) : null}
                  </ItemTitle>
                  <ItemDescription>
                    {messages.inventory.po.suggestionDescription(
                      s.hq_current_qty.toLocaleString("vi-VN"),
                      s.avg_daily_consumption.toLocaleString("vi-VN"),
                    )}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="flex-wrap justify-end">
                  <span className="font-mono text-sm font-semibold">
                    {s.suggested_qty.toLocaleString("vi-VN")}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {s.unit}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant={alreadyAdded ? "secondary" : "ghost"}
                    size="sm"
                    disabled={alreadyAdded || s.suggested_qty <= 0}
                    onClick={() => onAddSuggestion(s)}
                  >
                    {alreadyAdded ? (
                      messages.inventory.po.alreadyAdded
                    ) : (
                      <>
                        <IconPlus data-icon="inline-start" />
                        {ACTIONS_VI.add}
                      </>
                    )}
                  </Button>
                </ItemActions>
              </Item>
            );
          })}
        </div>
      )}
    </AppSection>
  );
}

// ---------------------------------------------------------------------------
// AddLineDraft — line editor state, mirroring GrnCreateClient's EditState.
// ---------------------------------------------------------------------------
type AddLineDraft = {
  ingredientId: string;
  unit: string;
  entryUnitId: number | null;
  quantity: number;
  unitPrice: number | null;
};

const EMPTY_ADD_LINE: AddLineDraft = {
  ingredientId: "",
  unit: "",
  entryUnitId: null,
  quantity: 0,
  unitPrice: null,
};

// ---------------------------------------------------------------------------
// LineItemsSection — line list + sheet-driven add flow (mobile parity w/ GRN)
// ---------------------------------------------------------------------------
function LineItemsSection({
  lines,
  lineDeviations,
  ingredients,
  supplierId,
  totalValue,
  hasValue,
  onRemoveLine,
  onAddLine,
}: {
  lines: LocalLine[];
  lineDeviations: Map<number, SinglePriceDeviation>;
  ingredients: IngredientRow[];
  supplierId: string;
  totalValue: number;
  hasValue: boolean;
  onRemoveLine: (idx: number) => void;
  onAddLine: (line: LocalLine) => void;
}) {
  const [draft, setDraft] = useState<AddLineDraft | null>(null);
  const [numpad, setNumpad] = useState<"qty" | "price" | null>(null);
  const [addRowDeviation, setAddRowDeviation] =
    useState<SinglePriceDeviation | null>(null);

  const selectedIngredient = draft
    ? ingredients.find((x) => String(x.id) === draft.ingredientId)
    : undefined;
  const purchaseUnitOptions = getPurchaseUnitOptions(selectedIngredient);

  function openAddLine() {
    setAddRowDeviation(null);
    setDraft(EMPTY_ADD_LINE);
  }

  function closeAddLine() {
    setDraft(null);
    setNumpad(null);
    setAddRowDeviation(null);
  }

  function patchDraft(patch: Partial<AddLineDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function handleIngredientChange(val: string) {
    setAddRowDeviation(null);
    const ing = ingredients.find((x) => String(x.id) === val);
    const defaultUnit = getDefaultPurchaseUnit(ing);
    patchDraft({
      ingredientId: val,
      unit: defaultUnit?.label ?? ing?.purchase_unit ?? ing?.unit ?? "",
      entryUnitId: defaultUnit?.unitId ?? null,
    });
  }

  function handleUnitChange(unitIdValue: string) {
    const opt = purchaseUnitOptions.find(
      (o) => String(o.unitId) === unitIdValue,
    );
    patchDraft({
      entryUnitId: Number(unitIdValue),
      unit: opt?.label ?? "",
    });
  }

  function checkDraftDeviation(price: number) {
    const ingId = Number(draft?.ingredientId);
    if (ingId && price > 0 && supplierId) {
      fetchSinglePriceDeviation({
        ingredientId: ingId,
        supplierId: Number(supplierId),
        currentPrice: price,
      }).then((res) => {
        if (res.success) {
          setAddRowDeviation(res.data as SinglePriceDeviation | null);
        }
      });
    } else {
      setAddRowDeviation(null);
    }
  }

  function commitAddLine() {
    if (!draft) return;
    const iid = Number(draft.ingredientId);
    if (!iid) {
      toast.error(messages.inventory.po.chooseIngredient);
      return;
    }
    const ing = ingredients.find((x) => x.id === iid);
    const resolvedUnit = draft.unit || ing?.purchase_unit || ing?.unit || "";
    if (!resolvedUnit || draft.quantity <= 0) {
      toast.error(messages.inventory.po.validQuantityRequired);
      return;
    }
    onAddLine({
      ingredientId: iid,
      ingredientName: ing?.name ?? `#${iid}`,
      quantity: draft.quantity,
      unit: resolvedUnit,
      entryUnitId: draft.entryUnitId,
      unitPriceEst: draft.unitPrice,
    });
    closeAddLine();
  }

  const draftValid =
    draft != null && draft.ingredientId !== "" && draft.quantity > 0;

  return (
    <AppSection
      title={PRODUCT_VI.rawIngredient}
      badge={
        lines.length > 0
          ? { children: messages.inventory.po.lineCount(lines.length) }
          : undefined
      }
    >
      {lines.length === 0 ? (
        <AppEmptyState
          compact
          icon={<IconPackage />}
          title={messages.inventory.po.emptyIngredientsTitle}
          description={messages.inventory.po.emptyIngredientsDescription}
        />
      ) : (
        <ItemGroup className="gap-2">
          {lines.map((line, idx) => {
            const dev = lineDeviations.get(line.ingredientId);
            return (
              <Item key={line.ingredientId} variant="outline" size="sm">
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full">
                    <span className="truncate">{line.ingredientName}</span>
                  </ItemTitle>
                  <ItemDescription>
                    {line.quantity.toLocaleString("vi-VN")} {line.unit}
                    {line.unitPriceEst != null
                      ? messages.inventory.po.totalAmountSuffix(
                          line.unitPriceEst.toLocaleString("vi-VN"),
                        )
                      : ""}
                  </ItemDescription>
                  {dev && Math.abs(dev.deviation_pct) > 5 ? (
                    <InlineDeviationHint deviation={dev} unit={line.unit} />
                  ) : null}
                </ItemContent>
                <ItemActions>
                  {line.unitPriceEst != null ? (
                    <span className="font-mono text-sm">
                      {formatVND(line.quantity * line.unitPriceEst)}
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    onClick={() => onRemoveLine(idx)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={messages.inventory.po.removeLineAria}
                  >
                    <IconTrash />
                  </Button>
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      )}

      {hasValue ? (
        <div className="flex items-center justify-between gap-2 border-t pt-3 text-sm">
          <span className="text-muted-foreground">
            {messages.inventory.po.estimatedTotal}
          </span>
          <span className="font-mono font-semibold">
            {formatVND(totalValue)}
          </span>
        </div>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="touch-lg"
        className="w-full"
        onClick={openAddLine}
      >
        <IconPlus data-icon="inline-start" />
        {messages.inventory.po.addLine}
      </Button>

      <AddLineSheet
        draft={draft}
        ingredient={selectedIngredient}
        ingredients={ingredients}
        unitOptions={purchaseUnitOptions}
        deviation={addRowDeviation}
        valid={draftValid}
        onIngredientChange={handleIngredientChange}
        onUnitChange={handleUnitChange}
        onOpenNumpad={setNumpad}
        onClose={closeAddLine}
        onCommit={commitAddLine}
      />

      <NumberPadSheet
        open={numpad === "qty"}
        onOpenChange={(next) => setNumpad(next ? "qty" : null)}
        title={messages.inventory.po.quantitySheetTitle(draft?.unit ?? "")}
        initialValue={draft?.quantity ?? 0}
        suffix={draft?.unit ?? ""}
        onConfirm={(value) => patchDraft({ quantity: value })}
        allowDecimal
      />
      <NumberPadSheet
        open={numpad === "price"}
        onOpenChange={(next) => setNumpad(next ? "price" : null)}
        title={messages.inventory.po.unitPrice}
        initialValue={draft?.unitPrice ?? 0}
        suffix="đ"
        onConfirm={(value) => {
          patchDraft({ unitPrice: value });
          checkDraftDeviation(value);
        }}
        allowDecimal={false}
      />
    </AppSection>
  );
}

// ---------------------------------------------------------------------------
// AddLineSheet — bottom sheet line editor (ingredient + qty/price via numpad).
// ---------------------------------------------------------------------------
function AddLineSheet({
  draft,
  ingredient,
  ingredients,
  unitOptions,
  deviation,
  valid,
  onIngredientChange,
  onUnitChange,
  onOpenNumpad,
  onClose,
  onCommit,
}: {
  draft: AddLineDraft | null;
  ingredient: IngredientRow | undefined;
  ingredients: IngredientRow[];
  unitOptions: PurchaseUnitOption[];
  deviation: SinglePriceDeviation | null;
  valid: boolean;
  onIngredientChange: (value: string) => void;
  onUnitChange: (value: string) => void;
  onOpenNumpad: (key: "qty" | "price") => void;
  onClose: () => void;
  onCommit: () => void;
}) {
  const open = draft != null;
  const lineTotal =
    draft && draft.unitPrice != null ? draft.quantity * draft.unitPrice : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="h-auto max-h-dvh-95 gap-0 bg-background p-0 text-foreground"
        showCloseButton={false}
      >
        {draft ? (
          <>
            <SheetHeader>
              <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                {messages.inventory.po.addLineTitle}
              </p>
              <SheetTitle className="text-lg font-semibold">
                {ingredient?.name ?? messages.inventory.po.addLineTitle}
              </SheetTitle>
            </SheetHeader>

            <div className="flex flex-col gap-3 p-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                  {PRODUCT_VI.rawIngredient}
                </Label>
                <Combobox
                  value={draft.ingredientId}
                  onValueChange={onIngredientChange}
                  options={ingredients.map((i) => ({
                    value: String(i.id),
                    label: i.name,
                    hint:
                      getDefaultPurchaseUnit(i)?.label ??
                      i.purchase_unit ??
                      i.unit,
                    keywords: [i.sku ?? "", i.category ?? ""],
                  }))}
                  placeholder={messages.inventory.po.ingredientPlaceholder}
                  searchPlaceholder={
                    messages.inventory.po.ingredientSearchPlaceholder
                  }
                />
              </div>

              <UnitField
                options={unitOptions}
                entryUnitId={draft.entryUnitId}
                unit={draft.unit}
                onUnitChange={onUnitChange}
              />

              <div className="grid grid-cols-2 gap-3">
                <NumpadValueButton
                  label={FORM_VI.quantity}
                  display={draft.quantity.toLocaleString("vi-VN")}
                  detail={draft.unit}
                  onClick={() => onOpenNumpad("qty")}
                />
                <NumpadValueButton
                  label={messages.inventory.po.unitPrice}
                  display={
                    draft.unitPrice != null
                      ? formatVND(draft.unitPrice)
                      : messages.inventory.po.priceOptionalPlaceholder
                  }
                  detail={draft.unit}
                  onClick={() => onOpenNumpad("price")}
                />
              </div>

              {lineTotal != null ? (
                <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-3 text-sm">
                  <span className="text-muted-foreground">
                    {FORM_VI.amount}
                  </span>
                  <span className="text-base font-semibold">
                    {formatVND(lineTotal)}
                  </span>
                </div>
              ) : null}

              {deviation && Math.abs(deviation.deviation_pct) > 5 ? (
                <InlineDeviationHint
                  deviation={deviation}
                  unit={draft.unit || messages.inventory.po.unitShort}
                />
              ) : null}
            </div>

            <SheetFooter>
              <Button
                type="button"
                size="touch-lg"
                className="w-full"
                onClick={onCommit}
                disabled={!valid}
              >
                {ACTIONS_VI.add}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="touch-lg"
                className="w-full"
                onClick={onClose}
              >
                {ACTIONS_VI.close}
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// NumpadValueButton — tappable value that opens a NumberPadSheet drawer.
// ---------------------------------------------------------------------------
function NumpadValueButton({
  label,
  display,
  detail,
  onClick,
}: {
  label: string;
  display: React.ReactNode;
  detail: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-1 rounded-md bg-muted/50 px-3 py-3 text-left transition active:scale-[0.99]"
    >
      <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-2xl font-semibold tabular-nums">{display}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// UnitField — unit dropdown.
// ---------------------------------------------------------------------------
function UnitField({
  options,
  entryUnitId,
  unit,
  onUnitChange,
}: {
  options: PurchaseUnitOption[];
  entryUnitId: number | null;
  unit: string;
  onUnitChange: (unitId: string) => void;
}) {
  if (options.length === 0) {
    return (
      <Select disabled value="">
        <SelectTrigger className="w-full" aria-label={unit}>
          <SelectValue placeholder={messages.inventory.po.selectUnit} />
        </SelectTrigger>
        <SelectContent />
      </Select>
    );
  }
  return (
    <Select
      value={entryUnitId != null ? String(entryUnitId) : ""}
      onValueChange={onUnitChange}
    >
      <SelectTrigger className="w-full" aria-label={unit}>
        <SelectValue placeholder={messages.inventory.po.selectUnit} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.unitId} value={String(o.unitId)}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// InlineDeviationHint
// ---------------------------------------------------------------------------
function InlineDeviationHint({
  deviation,
  unit,
}: {
  deviation: SinglePriceDeviation;
  unit: string;
}) {
  const isExpensive = deviation.deviation_pct > 0;
  const Icon = isExpensive ? IconTrendingUp : IconTrendingDown;
  const sign = isExpensive ? "+" : "";

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${
        isExpensive ? "text-destructive" : "text-success"
      }`}
    >
      <Icon className="size-3" />
      <span>
        {messages.inventory.po.deviationHint(
          deviation.sample_count,
          deviation.avg_price.toLocaleString("vi-VN"),
          unit,
          sign,
          deviation.deviation_pct,
        )}
      </span>
    </span>
  );
}
