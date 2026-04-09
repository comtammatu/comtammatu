"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronDown,
  Lightbulb,
  Package,
  Plus,
  PlusCircle,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@comtammatu/ui/components/collapsible";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
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

interface LocalLine {
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  unit: string;
  unitPriceEst: number | null;
}

export function NewPoClient({
  suppliers,
  ingredients,
  initialSuggestions,
}: {
  suppliers: SupplierRow[];
  ingredients: IngredientRow[];
  initialSuggestions: PoSuggestionRow[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LocalLine[]>([]);
  const [isPending, startTransition] = useTransition();

  // Suggestions state
  const [suggestions, setSuggestions] =
    useState<PoSuggestionRow[]>(initialSuggestions);
  const [periodDays, setPeriodDays] = useState<7 | 14 | 30>(7);
  const [suggestionsOpen, setSuggestionsOpen] = useState(
    initialSuggestions.length > 0,
  );
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

  function handlePeriodChange(val: string) {
    const days = Number(val) as 7 | 14 | 30;
    setPeriodDays(days);
    startSuggestionsTransition(async () => {
      const res = await fetchPoSuggestions({ periodDays: days });
      if (res.success) {
        setSuggestions((res.data ?? []) as PoSuggestionRow[]);
      }
    });
  }

  function addSuggestionToLines(s: PoSuggestionRow) {
    if (lineIngredientIds.has(s.ingredient_id)) {
      toast.info(`${s.ingredient_name} đã có trong PO`);
      return;
    }
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

  function submit() {
    if (!supplierId) {
      toast.error("Chọn nhà cung cấp");
      return;
    }
    if (lines.length === 0) {
      toast.error("Thêm ít nhất 1 nguyên liệu");
      return;
    }
    startTransition(async () => {
      const poRes = await createPurchaseOrder({
        supplierId: Number(supplierId),
        notes: notes || undefined,
      });
      if (!poRes.success || !poRes.data) {
        toast.error(poRes.error ?? "Không tạo được PO");
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
          router.push(`/admin/inventory/purchase-orders/${poId}`);
          return;
        }
      }
      toast.success("Đã tạo đơn đặt hàng");
      router.push(`/admin/inventory/purchase-orders/${poId}`);
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

  return (
    <div className="max-w-4xl space-y-5">
      {/* Back + title */}
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
          <Link href="/admin/inventory/purchase-orders">← Danh sách PO</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Tạo đơn đặt hàng</h1>
      </div>

      {/* PO header */}
      <SupplierSection
        suppliers={suppliers}
        supplierId={supplierId}
        onSupplierChange={setSupplierId}
        notes={notes}
        onNotesChange={setNotes}
      />

      {/* Suggestions panel */}
      <SuggestionsPanel
        suggestions={sortedSuggestions}
        suggestionsOpen={suggestionsOpen}
        onOpenChange={setSuggestionsOpen}
        periodDays={periodDays}
        onPeriodChange={handlePeriodChange}
        isLoading={isLoadingSuggestions}
        addableCount={addableCount}
        lineIngredientIds={lineIngredientIds}
        onAddSuggestion={addSuggestionToLines}
        onAddAll={addAllSuggestions}
        isMobile={isMobile}
      />

      {/* Line items */}
      <LineItemsSection
        lines={lines}
        lineDeviations={lineDeviations}
        ingredients={ingredients}
        supplierId={supplierId}
        totalValue={totalValue}
        hasValue={hasValue}
        isMobile={isMobile}
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

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <Button variant="ghost" asChild>
          <Link href="/admin/inventory/purchase-orders">Hủy</Link>
        </Button>
        <div className="flex items-center gap-3">
          {lines.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {lines.length} dòng
              {hasValue && ` · ${totalValue.toLocaleString("vi-VN")} ₫`}
            </span>
          )}
          <Button
            onClick={submit}
            disabled={isPending || !supplierId || lines.length === 0}
          >
            {isPending ? "Đang tạo…" : "Tạo PO"}
          </Button>
        </div>
      </div>
    </div>
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
    <div className="rounded-lg border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1.5">
          <Label>
            Nhà cung cấp <span className="text-destructive">*</span>
          </Label>
          <Select value={supplierId} onValueChange={onSupplierChange}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn nhà cung cấp" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Ghi chú</Label>
          <Input
            id="notes"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Ghi chú đơn hàng…"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SuggestionsPanel
// ---------------------------------------------------------------------------
function SuggestionsPanel({
  suggestions,
  suggestionsOpen,
  onOpenChange,
  periodDays,
  onPeriodChange,
  isLoading,
  addableCount,
  lineIngredientIds,
  onAddSuggestion,
  onAddAll,
  isMobile,
}: {
  suggestions: PoSuggestionRow[];
  suggestionsOpen: boolean;
  onOpenChange: (open: boolean) => void;
  periodDays: number;
  onPeriodChange: (val: string) => void;
  isLoading: boolean;
  addableCount: number;
  lineIngredientIds: Set<number>;
  onAddSuggestion: (s: PoSuggestionRow) => void;
  onAddAll: () => void;
  isMobile: boolean;
}) {
  return (
    <Collapsible open={suggestionsOpen} onOpenChange={onOpenChange}>
      <div className="rounded-lg border border-info/30 bg-info/5">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2">
              <Lightbulb className="size-4 text-info" />
              <span className="text-sm font-semibold">Gợi ý đặt hàng</span>
              {suggestions.length > 0 && (
                <Badge variant="info">{suggestions.length}</Badge>
              )}
            </div>
            <ChevronDown
              className={`size-4 text-muted-foreground transition-transform ${suggestionsOpen ? "rotate-180" : ""}`}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-info/20 px-4 pb-4 pt-3">
            {/* Period selector + bulk action */}
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Tiêu thụ trung bình
                </span>
                <Select
                  value={String(periodDays)}
                  onValueChange={onPeriodChange}
                  disabled={isLoading}
                >
                  <SelectTrigger className="h-7 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 ngày</SelectItem>
                    <SelectItem value="14">14 ngày</SelectItem>
                    <SelectItem value="30">30 ngày</SelectItem>
                  </SelectContent>
                </Select>
                {isLoading && (
                  <span className="text-xs text-muted-foreground">
                    Đang tải…
                  </span>
                )}
              </div>
              {addableCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={onAddAll}
                >
                  <PlusCircle className="mr-1 size-3.5" />
                  Thêm tất cả ({addableCount})
                </Button>
              )}
            </div>

            {/* Suggestion rows */}
            {suggestions.length === 0 ? (
              <div className="flex items-center gap-2 py-6 text-center text-sm text-muted-foreground">
                <Package className="mx-auto size-4" />
                <span>Tồn kho đầy đủ — không cần đặt thêm</span>
              </div>
            ) : isMobile ? (
              /* Mobile: card layout for suggestions */
              <div className="space-y-1.5">
                {suggestions.map((s) => {
                  const alreadyAdded = lineIngredientIds.has(s.ingredient_id);
                  return (
                    <div
                      key={s.ingredient_id}
                      className={`rounded-md border px-3 py-2 transition-colors ${
                        alreadyAdded
                          ? "opacity-60 bg-muted/30"
                          : "hover:bg-info/5"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate">
                              {s.ingredient_name}
                            </span>
                            {s.below_reorder && (
                              <Badge
                                variant="destructive"
                                className="text-xs shrink-0"
                              >
                                Thấp
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Tồn: {s.hq_current_qty.toLocaleString("vi-VN")} ·
                            TB: ~
                            {s.avg_daily_consumption.toLocaleString("vi-VN")}
                            /ngày
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-sm font-semibold">
                            {s.suggested_qty.toLocaleString("vi-VN")}{" "}
                            <span className="text-xs font-normal text-muted-foreground">
                              {s.unit}
                            </span>
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={alreadyAdded || s.suggested_qty <= 0}
                            onClick={() => onAddSuggestion(s)}
                          >
                            {alreadyAdded ? (
                              "Đã thêm"
                            ) : (
                              <Plus className="size-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Desktop: grid layout */
              <div className="space-y-1">
                <div className="grid grid-cols-12 gap-2 px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="col-span-3">Nguyên liệu</span>
                  <span className="col-span-2 text-right">Tồn HQ</span>
                  <span className="col-span-2 text-right">Tiêu thụ/ngày</span>
                  <span className="col-span-2 text-right">Gợi ý SL</span>
                  <span className="col-span-1">ĐV</span>
                  <span className="col-span-2" />
                </div>

                {suggestions.map((s) => {
                  const alreadyAdded = lineIngredientIds.has(s.ingredient_id);
                  return (
                    <div
                      key={s.ingredient_id}
                      className={`grid grid-cols-12 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                        alreadyAdded
                          ? "bg-muted/30 opacity-60"
                          : "hover:bg-info/5"
                      }`}
                    >
                      <div className="col-span-3 flex items-center gap-1.5">
                        <span className="truncate font-medium">
                          {s.ingredient_name}
                        </span>
                        {s.below_reorder && (
                          <Badge variant="destructive" className="text-xs">
                            Thấp
                          </Badge>
                        )}
                      </div>
                      <span className="col-span-2 text-right font-mono text-muted-foreground">
                        {s.hq_current_qty.toLocaleString("vi-VN")}
                      </span>
                      <span className="col-span-2 text-right font-mono">
                        ~{s.avg_daily_consumption.toLocaleString("vi-VN")}
                      </span>
                      <span className="col-span-2 text-right font-mono font-semibold">
                        {s.suggested_qty.toLocaleString("vi-VN")}
                      </span>
                      <span className="col-span-1 text-xs text-muted-foreground">
                        {s.unit}
                      </span>
                      <div className="col-span-2 flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={alreadyAdded || s.suggested_qty <= 0}
                          onClick={() => onAddSuggestion(s)}
                        >
                          {alreadyAdded ? (
                            "Đã thêm"
                          ) : (
                            <>
                              <Plus className="mr-0.5 size-3" />
                              Thêm
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
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
  const [addRowDeviation, setAddRowDeviation] =
    useState<SinglePriceDeviation | null>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  function handleIngredientChange(val: string) {
    setIngredientId(val);
    setAddRowDeviation(null);
    const ing = ingredients.find((x) => String(x.id) === val);
    if (ing) setUnit(ing.unit);
    setTimeout(() => qtyRef.current?.focus(), 0);
  }

  function handleAddLine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const iid = Number(ingredientId);
    if (!iid) {
      toast.error("Chọn nguyên liệu");
      return;
    }
    const ing = ingredients.find((x) => x.id === iid);
    const resolvedUnit = String(fd.get("unit") ?? ing?.unit ?? "");
    const qty = Number(fd.get("qty"));
    const priceRaw = String(fd.get("unitPriceEst") ?? "").trim();
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
    setAddRowDeviation(null);
    if (qtyRef.current) qtyRef.current.value = "";
    if (priceRef.current) priceRef.current.value = "";
  }

  function checkAddRowDeviation(e: React.FocusEvent<HTMLInputElement>) {
    const price = Number(e.target.value);
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
      <div className="rounded-lg border overflow-hidden">
        <div className="border-b bg-muted/30 px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Nguyên liệu
          </span>
          {hasValue && (
            <span className="text-sm font-semibold font-mono">
              {totalValue.toLocaleString("vi-VN")} ₫
            </span>
          )}
        </div>

        {lines.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Chưa có nguyên liệu — thêm bên dưới
          </div>
        ) : (
          <div className="divide-y">
            {lines.map((l, idx) => {
              const dev = lineDeviations.get(l.ingredientId);
              return (
                <div
                  key={idx}
                  className="px-4 py-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <span className="text-sm font-medium">
                      {l.ingredientName}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {l.quantity.toLocaleString("vi-VN")} {l.unit}
                      {l.unitPriceEst != null && (
                        <> · {l.unitPriceEst.toLocaleString("vi-VN")} ₫</>
                      )}
                    </p>
                    {dev && Math.abs(dev.deviation_pct) > 5 && (
                      <InlineDeviationHint deviation={dev} unit={l.unit} />
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {l.unitPriceEst != null && (
                      <span className="font-mono text-sm">
                        {(l.quantity * l.unitPriceEst).toLocaleString("vi-VN")}{" "}
                        ₫
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveLine(idx)}
                      className="size-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label="Xóa"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Mobile add-row form */}
        <form
          onSubmit={handleAddLine}
          className="border-t bg-muted/5 p-3 space-y-2"
        >
          <Select value={ingredientId} onValueChange={handleIngredientChange}>
            <SelectTrigger className="h-8 text-sm border-dashed">
              <SelectValue placeholder="+ Chọn nguyên liệu" />
            </SelectTrigger>
            <SelectContent>
              {ingredients.map((i) => (
                <SelectItem key={i.id} value={String(i.id)}>
                  {i.name} ({i.unit})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-3 gap-2">
            <Input
              ref={qtyRef}
              name="qty"
              type="number"
              step="any"
              min="0.001"
              required
              placeholder="SL"
              className="h-8 text-sm"
            />
            <Input
              name="unit"
              placeholder="ĐV"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              required
              className="h-8 text-sm"
            />
            <Input
              ref={priceRef}
              name="unitPriceEst"
              type="number"
              step="any"
              min="0"
              placeholder="Giá"
              className="h-8 text-sm"
              onBlur={checkAddRowDeviation}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={!ingredientId}
            className="w-full"
          >
            <Plus className="mr-1 size-3.5" />
            Thêm dòng
          </Button>
          {addRowDeviation && Math.abs(addRowDeviation.deviation_pct) > 5 && (
            <InlineDeviationHint
              deviation={addRowDeviation}
              unit={unit || "ĐV"}
            />
          )}
        </form>
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[2fr_80px_70px_120px_120px_40px] gap-0 border-b bg-muted/30 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Nguyên liệu
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
          Số lượng
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pl-2">
          ĐV
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
          Đơn giá (₫)
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
          Thành tiền
        </span>
        <span />
      </div>

      {/* Existing lines */}
      {lines.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Chưa có nguyên liệu — thêm dòng bên dưới
        </div>
      ) : (
        <div>
          {lines.map((l, idx) => {
            const dev = lineDeviations.get(l.ingredientId);
            return (
              <div
                key={idx}
                className="grid grid-cols-[2fr_80px_70px_120px_120px_40px] gap-0 items-center border-b px-3 py-2.5 hover:bg-muted/20 transition-colors"
              >
                <span className="text-sm font-medium">{l.ingredientName}</span>
                <span className="text-sm font-mono text-right">
                  {l.quantity.toLocaleString("vi-VN")}
                </span>
                <span className="text-sm pl-2 text-muted-foreground">
                  {l.unit}
                </span>
                <div className="text-sm font-mono text-right text-muted-foreground">
                  <span>
                    {l.unitPriceEst != null
                      ? l.unitPriceEst.toLocaleString("vi-VN")
                      : "—"}
                  </span>
                  {dev && Math.abs(dev.deviation_pct) > 5 && (
                    <InlineDeviationHint deviation={dev} unit={l.unit} />
                  )}
                </div>
                <span className="text-sm font-mono text-right">
                  {l.unitPriceEst != null
                    ? (l.quantity * l.unitPriceEst).toLocaleString("vi-VN")
                    : "—"}
                </span>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onRemoveLine(idx)}
                    className="size-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label="Xóa"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Total row */}
          {hasValue && (
            <div className="grid grid-cols-[2fr_80px_70px_120px_120px_40px] gap-0 items-center border-b px-3 py-2 bg-muted/10">
              <span className="col-span-4 text-xs font-semibold text-right text-muted-foreground uppercase tracking-wider">
                Tổng dự kiến
              </span>
              <span className="text-sm font-semibold font-mono text-right">
                {totalValue.toLocaleString("vi-VN")} ₫
              </span>
              <span />
            </div>
          )}
        </div>
      )}

      {/* Add-row form */}
      <form
        onSubmit={handleAddLine}
        className="grid grid-cols-[2fr_80px_70px_120px_120px_40px] gap-0 items-center bg-muted/5 border-t px-3 py-2"
      >
        <div className="pr-2">
          <Select value={ingredientId} onValueChange={handleIngredientChange}>
            <SelectTrigger className="h-8 text-sm border-dashed">
              <SelectValue placeholder="+ Chọn nguyên liệu" />
            </SelectTrigger>
            <SelectContent>
              {ingredients.map((i) => (
                <SelectItem key={i.id} value={String(i.id)}>
                  {i.name} ({i.unit})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Input
            ref={qtyRef}
            name="qty"
            type="number"
            step="any"
            min="0.001"
            required
            placeholder="SL"
            className="h-8 text-sm text-right"
          />
        </div>
        <div className="pl-2">
          <Input
            name="unit"
            placeholder="ĐV"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            required
            className="h-8 text-sm"
          />
        </div>
        <div className="pl-2">
          <Input
            ref={priceRef}
            name="unitPriceEst"
            type="number"
            step="any"
            min="0"
            placeholder="Giá (tùy chọn)"
            className="h-8 text-sm text-right"
            onBlur={checkAddRowDeviation}
          />
        </div>
        <div className="pl-2 flex justify-end">
          <button
            type="submit"
            disabled={!ingredientId}
            className="size-7 flex items-center justify-center rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Thêm dòng"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <span />
      </form>
      {addRowDeviation && Math.abs(addRowDeviation.deviation_pct) > 5 && (
        <div className="px-3 pb-2 -mt-0.5">
          <InlineDeviationHint
            deviation={addRowDeviation}
            unit={unit || "ĐV"}
          />
        </div>
      )}
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
  const Icon = isExpensive ? TrendingUp : TrendingDown;
  const sign = isExpensive ? "+" : "";

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs mt-0.5 ${
        isExpensive ? "text-destructive" : "text-green-600 dark:text-green-400"
      }`}
    >
      <Icon className="size-3" />
      <span>
        TB {deviation.sample_count} lần:{" "}
        <span className="font-mono font-semibold">
          {deviation.avg_price.toLocaleString("vi-VN")} ₫
        </span>
        /{unit} ({sign}
        {deviation.deviation_pct}%)
      </span>
    </span>
  );
}
