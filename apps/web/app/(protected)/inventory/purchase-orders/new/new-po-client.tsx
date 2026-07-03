"use client";

import { useRef, useState, useTransition } from "react";
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
import { Input } from "@comtammatu/ui/components/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
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
import { toast } from "@comtammatu/ui/components/sonner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { cn } from "@comtammatu/ui";
import { Combobox } from "@/components/form";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { FormattedNumberInput } from "../../_components/formatted-number-input";
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
  // Purchase-role unit id the qty was entered in. NULL = free-text unit.
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
        unit: defaultUnit?.code ?? s.unit,
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
          unit: defaultUnit?.code ?? s.unit,
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
          unit: l.unit,
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
        {header}
        <div className="flex flex-col gap-4">{body}</div>
        {footer}
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
// LineItemsSection — line items table with inline add-row
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
  const [ingredientId, setIngredientId] = useState("");
  const [unit, setUnit] = useState("");
  const [entryUnitId, setEntryUnitId] = useState<number | null>(null);
  const [qtyInput, setQtyInput] = useState("");
  const [unitPriceInput, setUnitPriceInput] = useState("");
  const [addRowDeviation, setAddRowDeviation] =
    useState<SinglePriceDeviation | null>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  const selectedIngredient = ingredients.find(
    (x) => String(x.id) === ingredientId,
  );
  const purchaseUnitOptions = getPurchaseUnitOptions(selectedIngredient);

  function handleIngredientChange(val: string) {
    setIngredientId(val);
    setAddRowDeviation(null);
    const ing = ingredients.find((x) => String(x.id) === val);
    const defaultUnit = getDefaultPurchaseUnit(ing);
    setUnit(defaultUnit?.code ?? ing?.purchase_unit ?? ing?.unit ?? "");
    setEntryUnitId(defaultUnit?.unitId ?? null);
    setTimeout(() => qtyRef.current?.focus(), 0);
  }

  function handleUnitChange(unitIdValue: string) {
    setEntryUnitId(Number(unitIdValue));
    const opt = purchaseUnitOptions.find(
      (o) => String(o.unitId) === unitIdValue,
    );
    if (opt) setUnit(opt.code);
  }

  function handleAddLine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const iid = Number(ingredientId);
    if (!iid) {
      toast.error("Chọn nguyên liệu");
      return;
    }
    const ing = ingredients.find((x) => x.id === iid);
    const resolvedUnit = unit || ing?.purchase_unit || ing?.unit || "";
    const qty = Number(qtyInput);
    const priceRaw = unitPriceInput.trim();
    const unitPriceEst = priceRaw === "" ? null : Number(priceRaw);
    if (!resolvedUnit || !Number.isFinite(qty) || qty <= 0) {
      toast.error("Nhập số lượng hợp lệ");
      return;
    }
    onAddLine({
      ingredientId: iid,
      ingredientName: ing?.name ?? `#${iid}`,
      quantity: qty,
      unit: resolvedUnit,
      entryUnitId,
      unitPriceEst,
    });
    setIngredientId("");
    setUnit("");
    setEntryUnitId(null);
    setQtyInput("");
    setUnitPriceInput("");
    setAddRowDeviation(null);
  }

  function checkAddRowDeviation() {
    const price = Number(unitPriceInput);
    const ingId = Number(ingredientId);
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

  const columns: DataTableColumn<LocalLine>[] = [
    {
      key: "ingredient",
      header: PRODUCT_VI.rawIngredient,
      render: (line) => {
        const dev = lineDeviations.get(line.ingredientId);
        return (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-medium">{line.ingredientName}</span>
            {dev && Math.abs(dev.deviation_pct) > 5 ? (
              <InlineDeviationHint deviation={dev} unit={line.unit} />
            ) : null}
          </div>
        );
      },
    },
    {
      key: "quantity",
      header: FORM_VI.quantity,
      className: "w-24 text-right",
      render: (line) => (
        <span className="font-mono">
          {line.quantity.toLocaleString("vi-VN")}
        </span>
      ),
    },
    {
      key: "unit",
      header: messages.inventory.po.unitShort,
      className: "w-20",
      render: (line) => (
        <span className="text-muted-foreground">{line.unit}</span>
      ),
    },
    {
      key: "unitPrice",
      header: messages.inventory.po.unitPrice,
      className: "w-32 text-right",
      render: (line) => (
        <span className="font-mono text-muted-foreground">
          {line.unitPriceEst != null
            ? line.unitPriceEst.toLocaleString("vi-VN")
            : "-"}
        </span>
      ),
    },
    {
      key: "amount",
      header: FORM_VI.amount,
      className: "w-32 text-right",
      render: (line) => (
        <span className="font-mono">
          {line.unitPriceEst != null
            ? formatVND(line.quantity * line.unitPriceEst)
            : "-"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-8 text-right",
      render: (_line, idx) => (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onRemoveLine(idx)}
          className="text-muted-foreground hover:text-destructive"
          aria-label={messages.inventory.po.removeLineAria}
        >
          <IconTrash />
        </Button>
      ),
    },
  ];

  return (
    <AppSection
      title={PRODUCT_VI.rawIngredient}
      badge={
        lines.length > 0
          ? { children: messages.inventory.po.lineCount(lines.length) }
          : undefined
      }
    >
      <DataTable
        columns={columns}
        data={lines}
        getRowKey={(line) => line.ingredientId}
        emptyTitle={messages.inventory.po.emptyIngredientsTitle}
        emptyDescription={messages.inventory.po.emptyIngredientsDescription}
        emptyIcon={<IconPackage />}
        mobileCardRender={(line, idx) => {
          const dev = lineDeviations.get(line.ingredientId);
          return (
            <Item variant="outline" size="sm">
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
                  size="icon-sm"
                  onClick={() => onRemoveLine(idx)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={messages.inventory.po.removeLineAria}
                >
                  <IconTrash />
                </Button>
              </ItemActions>
            </Item>
          );
        }}
        desktopFooterRows={
          hasValue
            ? [
                {
                  key: "total",
                  cells: [
                    {
                      key: "label",
                      colSpan: 4,
                      className:
                        "text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      content: messages.inventory.po.estimatedTotal,
                    },
                    {
                      key: "value",
                      className: "text-right font-mono font-semibold",
                      content: formatVND(totalValue),
                    },
                    { key: "spacer", content: null },
                  ],
                },
              ]
            : undefined
        }
        mobileFooter={
          hasValue ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {messages.inventory.po.estimatedTotal}
              </span>
              <span className="font-mono font-semibold">
                {formatVND(totalValue)}
              </span>
            </div>
          ) : null
        }
      />

      <form
        onSubmit={handleAddLine}
        className="grid grid-cols-1 gap-2 border-t pt-3 sm:grid-cols-2 lg:grid-cols-12"
      >
        <div className="lg:col-span-5">
          <Combobox
            value={ingredientId}
            onValueChange={handleIngredientChange}
            options={ingredients.map((i) => ({
              value: String(i.id),
              label: i.name,
              hint: i.purchase_unit ?? i.unit,
              keywords: [i.sku ?? "", i.category ?? ""],
            }))}
            placeholder={messages.inventory.po.ingredientPlaceholder}
            searchPlaceholder={messages.inventory.po.ingredientSearchPlaceholder}
            triggerClassName="border-dashed"
          />
        </div>
        <div className="lg:col-span-2">
          <FormattedNumberInput
            ref={qtyRef}
            placeholder={messages.inventory.po.quantityShort}
            className="text-right"
            value={qtyInput}
            onValueChange={setQtyInput}
            maxFractionDigits={3}
            required
          />
        </div>
        <div className="lg:col-span-2">
          <UnitField
            options={purchaseUnitOptions}
            entryUnitId={entryUnitId}
            unit={unit}
            onUnitChange={handleUnitChange}
            onFreeTextChange={setUnit}
          />
        </div>
        <div className="lg:col-span-2">
          <FormattedNumberInput
            ref={priceRef}
            placeholder={messages.inventory.po.priceOptionalPlaceholder}
            className="text-right"
            value={unitPriceInput}
            onValueChange={setUnitPriceInput}
            onBlur={checkAddRowDeviation}
            maxFractionDigits={0}
          />
        </div>
        <Button
          type="submit"
          disabled={!ingredientId}
          size="sm"
          className="w-full lg:col-span-1"
          aria-label={messages.inventory.po.addLine}
        >
          <IconPlus data-icon="inline-start" />
          <span className="lg:sr-only">{messages.inventory.po.addLine}</span>
        </Button>
        {addRowDeviation && Math.abs(addRowDeviation.deviation_pct) > 5 ? (
          <div className="sm:col-span-2 lg:col-span-12">
            <InlineDeviationHint
              deviation={addRowDeviation}
              unit={unit || messages.inventory.po.unitShort}
            />
          </div>
        ) : null}
      </form>
    </AppSection>
  );
}

// ---------------------------------------------------------------------------
// UnitField — purchase-role unit dropdown; falls back to free-text when the
// selected ingredient carries no purchase units.
// ---------------------------------------------------------------------------
function UnitField({
  options,
  entryUnitId,
  unit,
  onUnitChange,
  onFreeTextChange,
}: {
  options: PurchaseUnitOption[];
  entryUnitId: number | null;
  unit: string;
  onUnitChange: (unitId: string) => void;
  onFreeTextChange: (value: string) => void;
}) {
  if (options.length === 0) {
    return (
      <Input
        name="unit"
        placeholder={messages.inventory.po.unitShort}
        value={unit}
        onChange={(e) => onFreeTextChange(e.target.value)}
        required
      />
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
            {o.code}
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
