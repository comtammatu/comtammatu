"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft as IconArrowLeft,
  Check as IconCheck,
  Lightbulb as IconBulb,
  Package as IconPackage,
  Plus as IconPlus,
  Trash as IconTrash,
  TrendingDown as IconTrendingDown,
  TrendingUp as IconTrendingUp,
  Warehouse as IconWarehouse,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  LineGrid,
  LineGridAddRow,
  LineGridCell,
  LineGridEmpty,
  LineGridHeader,
  LineGridRow,
  LineGridTotalRow,
  type LineGridColumn,
} from "@comtammatu/ui/components/line-grid";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { cn } from "@comtammatu/ui";
import { Combobox } from "@/components/form";
import { FormattedNumberInput } from "../../_components/formatted-number-input";
import { AppPage, AppPageHeader } from "@/components/surface";
import {
  createPurchaseOrder,
  fetchPoSuggestions,
  fetchSinglePriceDeviation,
  upsertPurchaseOrderLine,
} from "../../procurement-actions";
import type {
  PoSuggestionRow,
  SinglePriceDeviation,
} from "../../procurement-actions";
import type { SupplierRow } from "../../suppliers/suppliers-client";
import type { IngredientRow } from "../../page";
import { messages } from "@lib/messages";
import { ACTIONS_VI, FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";

interface LocalLine {
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  unit: string;
  unitPriceEst: number | null;
}

const PO_LINE_COLUMNS: LineGridColumn[] = [
  {
    key: "ingredient",
    label: PRODUCT_VI.rawIngredient,
    flex: "minmax(0, 2fr)",
    truncate: true,
  },
  {
    key: "quantity",
    label: FORM_VI.quantity,
    width: 96,
    align: "end",
    mono: true,
  },
  {
    key: "unit",
    label: messages.inventory.po.unitShort,
    width: 72,
  },
  {
    key: "unitPrice",
    label: messages.inventory.po.unitPrice,
    width: 140,
    align: "end",
    mono: true,
  },
  {
    key: "amount",
    label: FORM_VI.amount,
    width: 148,
    align: "end",
    mono: true,
  },
  { key: "action", width: 48 },
];

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
}: {
  suppliers: SupplierRow[];
  ingredients: IngredientRow[];
  initialSuggestions: PoSuggestionRow[];
  procurementBranches: ProcurementBranchOption[];
  initialBranchId: number | null;
  canSwitchBranch: boolean;
  poBasePath?: string;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [supplierId, setSupplierId] = useState("");
  const [supplierAttempted, setSupplierAttempted] = useState(false);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LocalLine[]>([]);
  const [isPending, startTransition] = useTransition();

  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [suggestions, setSuggestions] =
    useState<PoSuggestionRow[]>(initialSuggestions);
  const [periodDays, setPeriodDays] = useState<7 | 14 | 30>(7);
  const [isLoadingSuggestions, startSuggestionsTransition] = useTransition();

  const [lineDeviations, setLineDeviations] = useState<
    Map<number, SinglePriceDeviation>
  >(new Map());

  const lineIngredientIds = new Set(lines.map((l) => l.ingredientId));
  const sortedSuggestions = [...suggestions].sort((a, b) => {
    if (a.below_reorder !== b.below_reorder) return a.below_reorder ? -1 : 1;
    return a.ingredient_name.localeCompare(b.ingredient_name, "vi");
  });

  function checkPriceDeviation(ingId: number, price: number) {
    if (!supplierId || price <= 0) return;
    fetchSinglePriceDeviation({
      ingredientId: ingId,
      supplierId: Number(supplierId),
      currentPrice: price,
    }).then((res) => {
      if (!res.success) return;
      const dev = res.data as SinglePriceDeviation | null;
      if (dev) {
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
    if (lineIngredientIds.has(s.ingredient_id)) return;
    const ing = ingredients.find((x) => x.id === s.ingredient_id);
    setLines((prev) => [
      ...prev,
      {
        ingredientId: s.ingredient_id,
        ingredientName: s.ingredient_name,
        quantity: s.suggested_qty,
        unit: s.unit,
        unitPriceEst: ing?.unit_cost ?? null,
      },
    ]);
  }

  function addAllSuggestions() {
    const toAdd = sortedSuggestions.filter(
      (s) => !lineIngredientIds.has(s.ingredient_id) && s.suggested_qty > 0,
    );
    if (toAdd.length === 0) {
      toast.info("Đã thêm hết gợi ý vào đơn");
      return;
    }
    setLines((prev) => [
      ...prev,
      ...toAdd.map((s) => {
        const ing = ingredients.find((x) => x.id === s.ingredient_id);
        return {
          ingredientId: s.ingredient_id,
          ingredientName: s.ingredient_name,
          quantity: s.suggested_qty,
          unit: s.unit,
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

  function addLine(line: LocalLine) {
    if (lines.some((l) => l.ingredientId === line.ingredientId)) {
      toast.error("Nguyên liệu đã có trong danh sách");
      return;
    }
    setLines((prev) => [...prev, line]);
    if (line.unitPriceEst != null && line.unitPriceEst > 0) {
      checkPriceDeviation(line.ingredientId, line.unitPriceEst);
    }
  }

  function submit() {
    if (!supplierId) {
      setSupplierAttempted(true);
      toast.error("Chọn nhà cung cấp ở thanh dưới trang");
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
      const poRes = await createPurchaseOrder({
        supplierId: Number(supplierId),
        branchId,
        notes: notes || undefined,
      });
      if (!poRes.success || !poRes.data) {
        toast.error(poRes.error ?? "Không tạo được đơn");
        return;
      }
      const poId = (poRes.data as { id: number }).id;
      for (const line of lines) {
        const lineRes = await upsertPurchaseOrderLine({
          poId,
          ingredientId: line.ingredientId,
          quantity: line.quantity,
          unit: line.unit,
          unitPriceEst: line.unitPriceEst,
        });
        if (!lineRes.success) {
          toast.error(`Lỗi "${line.ingredientName}": ${lineRes.error}`);
          router.push(`${poBasePath}/${poId}?branchId=${branchId}`);
          return;
        }
      }
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
  const hasSuggestions = sortedSuggestions.length > 0 || isLoadingSuggestions;
  const branchLabel =
    procurementBranches.find((b) => b.id === branchId)?.name ?? "—";
  const showBranchSwitcher = canSwitchBranch && procurementBranches.length > 1;

  return (
    <AppPage>
      <AppPageHeader
        density="compact"
        title={messages.inventory.po.newTitle}
        breadcrumb={
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
          >
            <Link href={poBasePath}>
              <IconArrowLeft className="size-4" />
              {messages.inventory.po.list}
            </Link>
          </Button>
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              Kho nhận:
            </span>
            {showBranchSwitcher ? (
              <Select
                value={branchId ? String(branchId) : ""}
                onValueChange={handleBranchChange}
              >
                <SelectTrigger size="sm" className="min-w-44">
                  <SelectValue placeholder="Chọn kho" />
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
              <Badge variant="secondary" className="gap-1.5">
                <IconWarehouse className="size-3.5" />
                {branchLabel}
              </Badge>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-4 pb-24">
        {hasSuggestions ? (
          <SuggestionsSection
            suggestions={sortedSuggestions}
            periodDays={periodDays}
            onPeriodChange={handlePeriodChange}
            isLoading={isLoadingSuggestions}
            addableCount={addableCount}
            lineIngredientIds={lineIngredientIds}
            onAddSuggestion={addSuggestionToLines}
            onAddAll={addAllSuggestions}
          />
        ) : null}

        <LineItemsTable
          lines={lines}
          lineDeviations={lineDeviations}
          ingredients={ingredients}
          supplierId={supplierId}
          totalValue={totalValue}
          hasValue={hasValue}
          isMobile={isMobile}
          onRemoveLine={removeLine}
          onAddLine={addLine}
        />

        <div className="grid gap-1.5">
          <Label htmlFor="po-notes">Ghi chú (tùy chọn)</Label>
          <Textarea
            id="po-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            placeholder={messages.inventory.po.notesPlaceholder}
            className="min-h-16"
          />
        </div>
      </div>

      <StickyFooter
        suppliers={suppliers}
        supplierId={supplierId}
        onSupplierChange={(val) => {
          setSupplierId(val);
          setSupplierAttempted(false);
        }}
        supplierAttempted={supplierAttempted}
        lines={lines}
        totalValue={totalValue}
        hasValue={hasValue}
        isPending={isPending}
        onSubmit={submit}
        onCancel={() =>
          router.push(
            branchId ? `${poBasePath}?branchId=${branchId}` : poBasePath,
          )
        }
      />
    </AppPage>
  );
}

// ---------------------------------------------------------------------------
// SuggestionsSection — primary entry, elevated above line table
// ---------------------------------------------------------------------------
function SuggestionsSection({
  suggestions,
  periodDays,
  onPeriodChange,
  isLoading,
  addableCount,
  lineIngredientIds,
  onAddSuggestion,
  onAddAll,
}: {
  suggestions: PoSuggestionRow[];
  periodDays: number;
  onPeriodChange: (val: string) => void;
  isLoading: boolean;
  addableCount: number;
  lineIngredientIds: Set<number>;
  onAddSuggestion: (s: PoSuggestionRow) => void;
  onAddAll: () => void;
}) {
  return (
    <Card className="border-info/30 bg-info/5">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <IconBulb className="size-4 text-info" />
            <span className="font-medium">
              Gợi ý {periodDays} ngày tới ({suggestions.length})
            </span>
            <Select
              value={String(periodDays)}
              onValueChange={onPeriodChange}
              disabled={isLoading}
            >
              <SelectTrigger size="xs" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 ngày</SelectItem>
                <SelectItem value="14">14 ngày</SelectItem>
                <SelectItem value="30">30 ngày</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {addableCount > 0 ? (
            <Button size="sm" onClick={onAddAll}>
              <IconPlus className="size-3.5" />
              Thêm tất cả {addableCount} mục
            </Button>
          ) : null}
        </div>

        {suggestions.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed bg-background/40 p-3 text-sm text-muted-foreground">
            <IconPackage className="size-4" />
            Tồn kho ổn định. Không có nguyên liệu nào cần đặt thêm.
          </div>
        ) : (
          <div className="flex flex-col divide-y rounded-md border bg-background/40">
            {suggestions.map((s) => {
              const alreadyAdded = lineIngredientIds.has(s.ingredient_id);
              return (
                <div
                  key={s.ingredient_id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 transition-colors",
                    alreadyAdded ? "opacity-60" : "hover:bg-muted/30",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {s.ingredient_name}
                      </span>
                      {s.below_reorder ? (
                        <Badge variant="destructive" className="text-xs">
                          Thiếu
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Tồn {s.hq_current_qty.toLocaleString("vi-VN")} {s.unit}
                      {" · "}~
                      {s.avg_daily_consumption.toLocaleString("vi-VN")} {s.unit}
                      /ngày
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="font-mono text-sm font-semibold tabular-nums">
                      {s.suggested_qty.toLocaleString("vi-VN")}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {s.unit}
                      </span>
                    </p>
                  </div>
                  <Button
                    variant={alreadyAdded ? "ghost" : "outline"}
                    size="sm"
                    disabled={alreadyAdded || s.suggested_qty <= 0}
                    onClick={() => onAddSuggestion(s)}
                    aria-label={
                      alreadyAdded
                        ? `${s.ingredient_name} đã thêm`
                        : `Thêm ${s.ingredient_name}`
                    }
                  >
                    {alreadyAdded ? (
                      <>
                        <IconCheck className="size-3.5" />
                        Đã thêm
                      </>
                    ) : (
                      <>
                        <IconPlus className="size-3.5" />
                        Thêm
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// LineItemsTable
// ---------------------------------------------------------------------------
function LineItemsTable({
  lines,
  lineDeviations,
  ingredients,
  supplierId,
  totalValue,
  hasValue,
  isMobile,
  onRemoveLine,
  onAddLine,
}: {
  lines: LocalLine[];
  lineDeviations: Map<number, SinglePriceDeviation>;
  ingredients: IngredientRow[];
  supplierId: string;
  totalValue: number;
  hasValue: boolean;
  isMobile: boolean;
  onRemoveLine: (idx: number) => void;
  onAddLine: (line: LocalLine) => void;
}) {
  const [ingredientId, setIngredientId] = useState("");
  const [unit, setUnit] = useState("");
  const [qtyInput, setQtyInput] = useState("");
  const [unitPriceInput, setUnitPriceInput] = useState("");
  const [addRowDeviation, setAddRowDeviation] =
    useState<SinglePriceDeviation | null>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  function handleIngredientChange(val: string) {
    setIngredientId(val);
    setAddRowDeviation(null);
    const ing = ingredients.find((x) => String(x.id) === val);
    if (ing) setUnit(ing.purchase_unit ?? ing.unit);
    setTimeout(() => qtyRef.current?.focus(), 0);
  }

  function handleAddLineSubmit(e: React.FormEvent<HTMLFormElement>) {
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
      unitPriceEst,
    });
    setIngredientId("");
    setUnit("");
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

  if (isMobile) {
    return (
      <Card className="overflow-hidden rounded-lg">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Trong đơn
              </span>
              {lines.length > 0 ? (
                <Badge variant="secondary">{lines.length} dòng</Badge>
              ) : null}
            </div>
            {hasValue ? (
              <span className="font-mono text-sm font-semibold">
                {totalValue.toLocaleString("vi-VN")} ₫
              </span>
            ) : null}
          </div>

          {lines.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-base font-semibold">
                {messages.inventory.po.emptyIngredientsTitle}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tick nguyên liệu trong gợi ý phía trên hoặc thêm dòng bên dưới.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {lines.map((l, idx) => {
                const dev = lineDeviations.get(l.ingredientId);
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium">
                        {l.ingredientName}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {l.quantity.toLocaleString("vi-VN")} {l.unit}
                        {l.unitPriceEst != null
                          ? ` · ${l.unitPriceEst.toLocaleString("vi-VN")}đ/${l.unit}`
                          : ""}
                      </p>
                      {dev && Math.abs(dev.deviation_pct) > 5 ? (
                        <InlineDeviationHint deviation={dev} unit={l.unit} />
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {l.unitPriceEst != null ? (
                        <span className="font-mono text-sm">
                          {(l.quantity * l.unitPriceEst).toLocaleString(
                            "vi-VN",
                          )}
                          ₫
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onRemoveLine(idx)}
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Xoá dòng"
                      >
                        <IconTrash className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <form
            onSubmit={handleAddLineSubmit}
            className="space-y-2 border-t bg-muted/5 p-3"
          >
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
              searchPlaceholder={
                messages.inventory.po.ingredientSearchPlaceholder
              }
              triggerClassName="h-8 border-dashed text-sm"
            />
            <div className="grid grid-cols-3 gap-2">
              <FormattedNumberInput
                ref={qtyRef}
                placeholder={messages.inventory.po.quantityShort}
                className="h-8 text-sm"
                value={qtyInput}
                onValueChange={setQtyInput}
                maxFractionDigits={3}
                required
              />
              <Input
                name="unit"
                placeholder={messages.inventory.po.unitShort}
                value={unit}
                readOnly
                aria-readonly="true"
                required
                className="h-8 text-sm"
              />
              <FormattedNumberInput
                ref={priceRef}
                placeholder={messages.inventory.po.priceOptionalPlaceholder}
                className="h-8 text-sm"
                value={unitPriceInput}
                onValueChange={setUnitPriceInput}
                onBlur={checkAddRowDeviation}
                maxFractionDigits={0}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={!ingredientId}
              className="w-full"
            >
              <IconPlus className="size-3.5" />
              {messages.inventory.po.addLine}
            </Button>
            {addRowDeviation && Math.abs(addRowDeviation.deviation_pct) > 5 ? (
              <InlineDeviationHint
                deviation={addRowDeviation}
                unit={unit || messages.inventory.po.unitShort}
              />
            ) : null}
          </form>
        </CardContent>
      </Card>
    );
  }

  // Desktop layout — LineGrid primitive
  return (
    <Card className="overflow-hidden rounded-lg">
      <CardContent className="p-0">
        <LineGrid columns={PO_LINE_COLUMNS}>
          <LineGridHeader />
          {lines.length === 0 ? (
            <LineGridEmpty>
              <p className="text-base font-semibold">
                {messages.inventory.po.emptyIngredientsTitle}
              </p>
              <p className="mt-1 text-muted-foreground">
                Tick nguyên liệu trong gợi ý phía trên hoặc thêm dòng bên dưới.
              </p>
            </LineGridEmpty>
          ) : (
            <>
              {lines.map((l, idx) => {
                const dev = lineDeviations.get(l.ingredientId);
                const showDeviation = dev && Math.abs(dev.deviation_pct) > 5;
                return (
                  <LineGridRow key={idx}>
                    <LineGridCell idx={0}>
                      <span className="font-medium">{l.ingredientName}</span>
                    </LineGridCell>
                    <LineGridCell idx={1}>
                      {l.quantity.toLocaleString("vi-VN")}
                    </LineGridCell>
                    <LineGridCell idx={2}>
                      <span className="text-muted-foreground">{l.unit}</span>
                    </LineGridCell>
                    <LineGridCell
                      idx={3}
                      className="flex-col items-end gap-0.5 text-muted-foreground"
                    >
                      <span>
                        {l.unitPriceEst != null
                          ? l.unitPriceEst.toLocaleString("vi-VN")
                          : "—"}
                      </span>
                      {showDeviation ? (
                        <InlineDeviationHint deviation={dev} unit={l.unit} />
                      ) : null}
                    </LineGridCell>
                    <LineGridCell idx={4}>
                      {l.unitPriceEst != null
                        ? (l.quantity * l.unitPriceEst).toLocaleString("vi-VN")
                        : "—"}
                    </LineGridCell>
                    <LineGridCell idx={5}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onRemoveLine(idx)}
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Xoá dòng"
                      >
                        <IconTrash className="size-3.5" />
                      </Button>
                    </LineGridCell>
                  </LineGridRow>
                );
              })}

              {hasValue ? (
                <LineGridTotalRow valueAtIdx={4} label="Tổng tạm tính">
                  {messages.inventory.common.currency(
                    totalValue.toLocaleString("vi-VN"),
                  )}
                </LineGridTotalRow>
              ) : null}
            </>
          )}

          <LineGridAddRow asChild>
            <form onSubmit={handleAddLineSubmit}>
              <LineGridCell idx={0}>
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
                  searchPlaceholder={
                    messages.inventory.po.ingredientSearchPlaceholder
                  }
                  triggerClassName="h-8 w-full border-dashed text-sm"
                />
              </LineGridCell>
              <LineGridCell idx={1}>
                <FormattedNumberInput
                  ref={qtyRef}
                  placeholder={messages.inventory.po.quantityShort}
                  className="h-8 w-full text-sm text-right"
                  value={qtyInput}
                  onValueChange={setQtyInput}
                  maxFractionDigits={3}
                  required
                />
              </LineGridCell>
              <LineGridCell idx={2}>
                <Input
                  name="unit"
                  placeholder={messages.inventory.po.unitShort}
                  value={unit}
                  readOnly
                  aria-readonly="true"
                  required
                  className="h-8 w-full text-sm"
                />
              </LineGridCell>
              <LineGridCell idx={3}>
                <FormattedNumberInput
                  ref={priceRef}
                  placeholder={messages.inventory.po.priceOptionalPlaceholder}
                  className="h-8 w-full text-sm text-right"
                  value={unitPriceInput}
                  onValueChange={setUnitPriceInput}
                  onBlur={checkAddRowDeviation}
                  maxFractionDigits={0}
                />
              </LineGridCell>
              <LineGridCell idx={4} aria-hidden="true" />
              <LineGridCell idx={5}>
                <Button
                  type="submit"
                  disabled={!ingredientId}
                  size="icon-sm"
                  aria-label={messages.inventory.po.addLine}
                >
                  <IconPlus className="size-3.5" />
                </Button>
              </LineGridCell>
            </form>
          </LineGridAddRow>
        </LineGrid>
        {addRowDeviation && Math.abs(addRowDeviation.deviation_pct) > 5 ? (
          <div className="bg-muted/5 px-3 pb-2 md:px-5">
            <InlineDeviationHint
              deviation={addRowDeviation}
              unit={unit || messages.inventory.po.unitShort}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// StickyFooter — supplier selector + summary + submit
// ---------------------------------------------------------------------------
function StickyFooter({
  suppliers,
  supplierId,
  onSupplierChange,
  supplierAttempted,
  lines,
  totalValue,
  hasValue,
  isPending,
  onSubmit,
  onCancel,
}: {
  suppliers: SupplierRow[];
  supplierId: string;
  onSupplierChange: (val: string) => void;
  supplierAttempted: boolean;
  lines: LocalLine[];
  totalValue: number;
  hasValue: boolean;
  isPending: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const supplierError = supplierAttempted && !supplierId;

  return (
    <div className="sticky bottom-0 z-10 mt-2 flex flex-col gap-3 border-t bg-background/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:flex-row sm:items-center sm:justify-between">
      <Button
        variant="ghost"
        onClick={onCancel}
        className="hidden sm:inline-flex"
        disabled={isPending}
      >
        {ACTIONS_VI.cancel}
      </Button>

      <div className="flex flex-1 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground md:inline">
            Gửi NCC:
          </span>
          <Combobox
            value={supplierId}
            onValueChange={onSupplierChange}
            options={suppliers.map((s) => ({
              value: String(s.id),
              label: s.name,
            }))}
            placeholder="Chọn nhà cung cấp"
            searchPlaceholder="Tìm nhà cung cấp..."
            aria-label="Nhà cung cấp"
            aria-invalid={supplierError ? true : undefined}
            triggerClassName={cn(
              "min-w-44",
              supplierError &&
                "border-destructive ring-2 ring-destructive/20",
            )}
          />
        </div>

        {lines.length > 0 ? (
          <span className="hidden text-sm text-muted-foreground md:inline">
            <span className="font-medium text-foreground">
              {lines.length} dòng
            </span>
            {hasValue ? (
              <>
                {" · "}
                <span className="font-mono font-semibold text-foreground tabular-nums">
                  {messages.inventory.common.currency(
                    totalValue.toLocaleString("vi-VN"),
                  )}
                </span>
              </>
            ) : null}
          </span>
        ) : null}

        <Button onClick={onSubmit} disabled={isPending || lines.length === 0}>
          {isPending
            ? messages.inventory.po.creating
            : messages.inventory.po.createPo}
        </Button>

        <Button
          variant="ghost"
          onClick={onCancel}
          className="sm:hidden"
          disabled={isPending}
        >
          {ACTIONS_VI.cancel}
        </Button>
      </div>
    </div>
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
      className={cn(
        "mt-0.5 inline-flex items-center gap-1 text-xs",
        isExpensive ? "text-destructive" : "text-success",
      )}
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
