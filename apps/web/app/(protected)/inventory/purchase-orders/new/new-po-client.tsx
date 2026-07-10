"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPercent } from "@comtammatu/shared/format";
import {
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
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@comtammatu/ui/components/sheet";
import { toast } from "@comtammatu/ui/components/sonner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { cn } from "@comtammatu/ui";
import { Combobox, FormField } from "@/components/form";
import { NumberPadSheet } from "@/components/form/number-pad-sheet";
import { formatQty, formatVND } from "../../_lib/format";
import {
  getDefaultPurchaseUnit,
  getPurchaseUnitOptions,
  type PurchaseUnitOption,
} from "../../_lib/purchase-units";
import { getReferenceCostForUnit } from "../../_lib/reference-cost";
import {
  AppBackLink,
  AppDetailFooter,
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

const toastIngredientAlreadyExists = "đã có trong PO";
const toastAddedIngredient = "Đã thêm";
const toastNoSuggestionsToAdd = "Không có gợi ý nào để thêm";
const toastAddedIngredientsPrefix = "Đã thêm ";
const toastAddedIngredientsSuffix = " nguyên liệu";
const toastChooseSupplier = "Chọn nhà cung cấp";
const toastChooseReceivingBranch = "Chọn kho nhận hàng";
const toastAddAtLeastOneIngredient = "Thêm ít nhất 1 nguyên liệu";
const toastCreatePoFailed = "Không tạo được PO";
const toastCreatePoSuccess = "Đã tạo đơn đặt hàng";
const branchUnselected = "Chưa chọn";
const currencySuffix = "đ";
const poHeaderSupplierFallback = "Chưa chọn nhà cung cấp";
const poHeaderSupplierSelected = "Đã chọn";
const poHeaderNotesPresent = "Có ghi chú";
const poHeaderNotesEmpty = "Chưa ghi chú";

function formatDongForSuffix(amount: number): string {
  return formatVND(amount).replace(/đ$/, "");
}

function isSameReferencePrice(
  currentPrice: number | null,
  referenceCost: { value: number } | null,
): boolean {
  return (
    currentPrice != null &&
    referenceCost != null &&
    Math.abs(currentPrice - referenceCost.value) < 0.01
  );
}

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
        toast.error(res.error ?? messages.inventory.po.suggestionsLoadFailed);
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

  function buildSuggestionLine(s: PoSuggestionRow): LocalLine {
    const ing = ingredients.find((x) => x.id === s.ingredient_id);
    const defaultUnit = getDefaultPurchaseUnit(ing);
    const referenceCost = getReferenceCostForUnit(
      ing,
      defaultUnit?.unitId,
      defaultUnit?.label ?? s.unit,
    );
    return {
      ingredientId: s.ingredient_id,
      ingredientName: s.ingredient_name,
      quantity: s.suggested_qty,
      unit: defaultUnit?.label ?? s.unit,
      entryUnitId: defaultUnit?.unitId ?? null,
      unitPriceEst: referenceCost?.value ?? null,
    };
  }

  function addSuggestionToLines(s: PoSuggestionRow) {
    if (lineIngredientIds.has(s.ingredient_id)) {
      toast.info(`${s.ingredient_name} ${toastIngredientAlreadyExists}`);
      return;
    }
    setLines((prev) => [...prev, buildSuggestionLine(s)]);
    toast.success(`${toastAddedIngredient} ${s.ingredient_name}`);
  }

  function addAllSuggestions() {
    const toAdd = sortedSuggestions.filter(
      (s) => !lineIngredientIds.has(s.ingredient_id) && s.suggested_qty > 0,
    );
    if (toAdd.length === 0) {
      toast.info(toastNoSuggestionsToAdd);
      return;
    }
    setLines((prev) => [...prev, ...toAdd.map(buildSuggestionLine)]);
    toast.success(
      toastAddedIngredientsPrefix + toAdd.length + toastAddedIngredientsSuffix,
    );
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
      toast.error(toastChooseSupplier);
      return;
    }
    if (!branchId) {
      toast.error(toastChooseReceivingBranch);
      return;
    }
    if (lines.length === 0) {
      toast.error(toastAddAtLeastOneIngredient);
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
        toast.error(res.error ?? toastCreatePoFailed);
        return;
      }
      const poId = (res.data as { id: number }).id;
      toast.success(toastCreatePoSuccess);
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
  const selectedBranchName =
    procurementBranches.find((branch) => branch.id === branchId)?.name ??
    branchUnselected;

  const header = (
    <AppPageHeader
      eyebrow={messages.inventory.po.draftEyebrow}
      title={messages.inventory.po.newTitle}
      description={messages.inventory.po.draftDescription}
      breadcrumb={
        <AppBackLink href={poBasePath}>{messages.inventory.po.list}</AppBackLink>
      }
    />
  );

  const body = (
    <>
      <SupplierSection
        suppliers={suppliers}
        supplierId={supplierId}
        onSupplierChange={setSupplierId}
        branchName={selectedBranchName}
        notes={notes}
        onNotesChange={setNotes}
        embedded={embedded}
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
        embedded={embedded}
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

  const footerLeading = (
    <Button variant="ghost" size={embedded ? "touch" : "default"} asChild>
      <Link href={branchId ? `${poBasePath}?branchId=${branchId}` : poBasePath}>
        {ACTIONS_VI.cancel}
      </Link>
    </Button>
  );
  const footerTrailing = (
    <>
      {lines.length > 0 && (
        <span className="text-sm text-muted-foreground sm:text-right">
          {messages.inventory.po.lineCount(lines.length)}
          {hasValue
            ? messages.inventory.po.totalAmountSuffix(
                formatDongForSuffix(totalValue),
              )
            : ""}
        </span>
      )}
      <Button
        onClick={submit}
        disabled={isPending || !supplierId || lines.length === 0}
        size={embedded ? "touch-lg" : "default"}
      >
        {isPending
          ? messages.inventory.po.creating
          : messages.inventory.po.createPo}
      </Button>
    </>
  );
  const footer = (
    <AppDetailFooter
      className="border-0 py-0"
      leading={footerLeading}
      trailing={footerTrailing}
    />
  );

  if (embedded) {
    return (
      <div className="flex w-full flex-col gap-3">
        <div className="flex flex-col gap-3">{body}</div>
        <AppDetailFooter
          sticky
          leading={footerLeading}
          trailing={footerTrailing}
        />
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

function SupplierSection({
  suppliers,
  supplierId,
  onSupplierChange,
  branchName,
  notes,
  onNotesChange,
  embedded,
}: {
  suppliers: SupplierRow[];
  supplierId: string;
  onSupplierChange: (v: string) => void;
  branchName: string;
  notes: string;
  onNotesChange: (v: string) => void;
  embedded: boolean;
}) {
  const supplierName =
    suppliers.find((supplier) => String(supplier.id) === supplierId)?.name ??
    poHeaderSupplierFallback;
  const notesLabel = notes.trim() ? poHeaderNotesPresent : poHeaderNotesEmpty;

  return (
    <AppSection
      title={messages.inventory.po.headerInfoTitle}
      description={messages.inventory.po.headerInfoDescription}
      action={
        <Sheet>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size={embedded ? "touch" : "sm"}
            >
              {ACTIONS_VI.edit}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-dvh-95 p-0">
            <SheetHeader>
              <SheetTitle>{messages.inventory.po.headerInfoTitle}</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-3 overflow-y-auto px-3 py-3 sm:px-4">
              <FormField
                controlId="po-supplier"
                label={messages.inventory.po.supplierRequired}
                required
              >
                <Combobox
                  id="po-supplier"
                  value={supplierId}
                  onValueChange={onSupplierChange}
                  options={suppliers.map((s) => ({
                    value: String(s.id),
                    label: s.name,
                  }))}
                  placeholder={messages.inventory.po.supplierPlaceholder}
                  searchPlaceholder={
                    messages.inventory.po.supplierSearchPlaceholder
                  }
                />
              </FormField>
              <FormField controlId="notes" label={FORM_VI.notes}>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                  rows={3}
                  placeholder={messages.inventory.po.notesPlaceholder}
                  className="min-h-24"
                />
              </FormField>
            </div>
            <SheetFooter>
              <Button type="button" size="touch-lg" asChild>
                <SheetClose>{ACTIONS_VI.close}</SheetClose>
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      }
    >
      <ItemGroup className="gap-2">
        <Item variant="outline" size="sm" className="justify-between">
          <ItemContent>
            <ItemTitle>{supplierName}</ItemTitle>
            <ItemDescription>
              {messages.inventory.po.supplierRequired}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Badge variant={supplierId ? "success" : "warning"}>
              {supplierId ? poHeaderSupplierSelected : FORM_VI.required}
            </Badge>
          </ItemActions>
        </Item>
        <Item variant="muted" size="sm">
          <ItemContent>
            <ItemTitle>{messages.inventory.po.warehouseShort}</ItemTitle>
            <ItemDescription>{branchName}</ItemDescription>
          </ItemContent>
        </Item>
        <Item variant="muted" size="sm">
          <ItemContent>
            <ItemTitle>{FORM_VI.notes}</ItemTitle>
            <ItemDescription>{notesLabel}</ItemDescription>
          </ItemContent>
        </Item>
      </ItemGroup>
    </AppSection>
  );
}

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
  embedded,
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
  embedded: boolean;
}) {
  const branchLabel =
    procurementBranches.find((b) => b.id === branchId)?.name ??
    branchUnselected;
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
          <Button
            variant="outline"
            size={embedded ? "touch" : "sm"}
            onClick={onAddAll}
          >
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
            <SelectTrigger
              size={embedded ? "touch" : "default"}
              className={embedded ? "min-h-12 w-full" : "w-40"}
            >
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
          <SelectTrigger
            size={embedded ? "touch" : "default"}
            className={embedded ? "min-h-12 w-full" : "w-28"}
          >
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
                    : "bg-background/70 hover:bg-info/10",
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
                      formatQty(s.hq_current_qty),
                      formatQty(s.avg_daily_consumption),
                    )}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="flex-wrap justify-end">
                  <span className="font-mono text-sm font-semibold">
                    {formatQty(s.suggested_qty)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {s.unit}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant={alreadyAdded ? "secondary" : "ghost"}
                    size={embedded ? "touch" : "sm"}
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
    const unit =
      defaultUnit?.label ?? ing?.units?.find((u) => u.is_base)?.unit_code ?? "";
    const referenceCost = getReferenceCostForUnit(
      ing,
      defaultUnit?.unitId,
      unit,
    );
    patchDraft({
      ingredientId: val,
      unit,
      entryUnitId: defaultUnit?.unitId ?? null,
      unitPrice: referenceCost?.value ?? null,
    });
  }

  function handleUnitChange(unitIdValue: string) {
    if (!draft) return;
    const opt = purchaseUnitOptions.find(
      (o) => String(o.unitId) === unitIdValue,
    );
    const nextUnitId = Number(unitIdValue);
    const currentReferenceCost = getReferenceCostForUnit(
      selectedIngredient,
      draft.entryUnitId,
      draft.unit,
    );
    const nextReferenceCost = getReferenceCostForUnit(
      selectedIngredient,
      nextUnitId,
      opt?.label ?? "",
    );
    patchDraft({
      entryUnitId: nextUnitId,
      unit: opt?.label ?? "",
      ...(draft.unitPrice == null ||
      isSameReferencePrice(draft.unitPrice, currentReferenceCost)
        ? { unitPrice: nextReferenceCost?.value ?? draft.unitPrice }
        : {}),
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
    const resolvedUnit =
      draft.unit || ing?.units?.find((u) => u.is_base)?.unit_code || "";
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
                    {formatQty(line.quantity)} {line.unit}
                    {line.unitPriceEst != null
                      ? messages.inventory.po.totalAmountSuffix(
                          formatDongForSuffix(line.unitPriceEst),
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
        suffix={currencySuffix}
        onConfirm={(value) => {
          patchDraft({ unitPrice: value });
          checkDraftDeviation(value);
        }}
        allowDecimal={false}
      />
    </AppSection>
  );
}

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
        className="h-auto max-h-dvh-95 gap-1 bg-background p-0 text-foreground"
        showCloseButton={false}
      >
        {draft ? (
          <>
            <SheetHeader>
              <SectionLabel density="dense">
                {messages.inventory.po.addLineTitle}
              </SectionLabel>
              <SheetTitle className="text-lg font-semibold">
                {ingredient?.name ?? messages.inventory.po.addLineTitle}
              </SheetTitle>
            </SheetHeader>

            <div className="flex flex-col gap-3 p-4">
              <FormField
                controlId="po-line-ingredient"
                label={PRODUCT_VI.rawIngredient}
                required
              >
                <Combobox
                  id="po-line-ingredient"
                  value={draft.ingredientId}
                  onValueChange={onIngredientChange}
                  options={ingredients.map((i) => ({
                    value: String(i.id),
                    label: i.name,
                    hint:
                      getDefaultPurchaseUnit(i)?.label ??
                      i.units?.find((u) => u.is_base)?.unit_code ??
                      "",
                    keywords: [i.sku ?? "", i.category ?? ""],
                  }))}
                  placeholder={messages.inventory.po.ingredientPlaceholder}
                  searchPlaceholder={
                    messages.inventory.po.ingredientSearchPlaceholder
                  }
                />
              </FormField>

              <UnitField
                options={unitOptions}
                entryUnitId={draft.entryUnitId}
                onUnitChange={onUnitChange}
              />

              <div className="grid grid-cols-2 gap-3">
                <NumpadValueButton
                  label={FORM_VI.quantity}
                  display={formatQty(draft.quantity)}
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
    <Button
      type="button"
      variant="outline"
      size="touch-lg"
      onClick={onClick}
      className="h-auto w-full flex-col items-start justify-start gap-1 bg-muted/50 px-3 py-3 text-left whitespace-normal"
    >
      <SectionLabel density="dense">{label}</SectionLabel>
      <span className="text-2xl font-semibold tabular-nums">{display}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </Button>
  );
}

function UnitField({
  options,
  entryUnitId,
  onUnitChange,
}: {
  options: PurchaseUnitOption[];
  entryUnitId: number | null;
  onUnitChange: (unitId: string) => void;
}) {
  return (
    <FormField controlId="po-line-unit" label={FORM_VI.unit}>
      {options.length === 0 ? (
        <Select disabled value="">
          <SelectTrigger id="po-line-unit" size="field" className="w-full">
            <SelectValue placeholder={messages.inventory.po.selectUnit} />
          </SelectTrigger>
          <SelectContent />
        </Select>
      ) : (
        <Select
          value={entryUnitId != null ? String(entryUnitId) : ""}
          onValueChange={onUnitChange}
        >
          <SelectTrigger id="po-line-unit" size="field" className="w-full">
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
      )}
    </FormField>
  );
}

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
          formatDongForSuffix(deviation.avg_price),
          unit,
          sign,
          formatPercent(deviation.deviation_pct),
        )}
      </span>
    </span>
  );
}
