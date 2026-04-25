"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconArrowBarRight,
  IconClipboardList,
  IconPencil,
  IconReceipt,
  IconSearch,
  IconShoppingCart,
  IconTrash,
  IconTruck,
} from "@tabler/icons-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { cn } from "@comtammatu/ui";
import { InventoryHeader } from "../_components/inventory-header";
import {
  InventoryFilterBar,
  InventoryPageContent,
} from "../_components/inventory-page-layout";
import { StatusBadge } from "../_components/status-badge";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { InteractiveCard } from "../_components/interactive-card";
import { formatDateTime, formatQty, formatVND } from "../_lib/format";
import { CATEGORY_TONE_CLASS } from "../_lib/constants";
import { AdjustStockDialog } from "./adjust-stock-dialog";

export type StockIngredient = {
  id: number;
  name: string;
  sku: string;
  unit: string;
  category: string;
  qty: number;
  cost: number;
  min: number;
  max: number;
  reorder: number;
  status: "normal" | "low" | "out" | "over";
  lastCount: string;
  temp: string | null;
};

export type StockWorkSummary = {
  underThresholdCount: number;
  expiryCount: number;
  pendingGrnCount: number;
  pendingTransferCount: number;
  pendingWorkCount: number;
};

export type StockActionPermissions = {
  canReceiveGrn: boolean;
  canCreateTransfer: boolean;
  canCreateStocktake: boolean;
  canWriteoff: boolean;
  canCreatePurchaseOrder: boolean;
  canAdjustException: boolean;
};

export type StockMovementHistory = {
  id: number;
  ingredientId: number;
  type: string;
  movementSubtype: string | null;
  quantityChange: number;
  unitCost: number | null;
  reason: string | null;
  createdAt: string;
  grnId: number | null;
  transferId: number | null;
  issueId: number | null;
  orderId: number | null;
  productionOrderId: number | null;
};

type StockFilter = "all" | "in_stock" | "low" | "out";
type RiskFilter = "all" | "reorder" | "not_counted";
type SortMode = "priority" | "name" | "value_desc";
type MovementBadgeVariant = "success" | "destructive" | "secondary";

const stockFilterOptions: { value: StockFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "in_stock", label: "Còn hàng" },
  { value: "low", label: "Thấp" },
  { value: "out", label: "Hết hàng" },
];

const riskFilterOptions: { value: RiskFilter; label: string }[] = [
  { value: "all", label: "Tất cả rủi ro" },
  { value: "reorder", label: "Chạm reorder" },
  { value: "not_counted", label: "Chưa kiểm kê" },
];

const sortOptions: { value: SortMode; label: string }[] = [
  { value: "priority", label: "Ưu tiên cần xử lý" },
  { value: "name", label: "Tên A-Z" },
  { value: "value_desc", label: "Giá trị cao trước" },
];

const STATUS_PRIORITY: Record<StockIngredient["status"], number> = {
  out: 0,
  low: 1,
  over: 2,
  normal: 3,
};

function branchHref(branchId: number, path: string): string {
  return `${path}?branchId=${branchId}`;
}

function stockValue(item: StockIngredient): number {
  return item.qty * item.cost;
}

function isReorderRisk(item: StockIngredient): boolean {
  return (
    item.status === "out" || item.status === "low" || item.qty <= item.reorder
  );
}

function movementLabel(movement: StockMovementHistory): string {
  if (movement.type === "grn_receipt") return "Nhập GRN";
  if (movement.type === "transfer_in") return "Nhận chuyển";
  if (movement.type === "transfer_out") return "Xuất chuyển";
  if (movement.type === "production_consumption") return "Xuất sản xuất";
  if (movement.type === "production_output") return "Nhập sản xuất";
  if (movement.type === "count_adjustment") return "Kiểm kê";
  if (movement.type === "adjustment") return "Điều chỉnh";
  if (movement.type === "consumption") {
    if (movement.movementSubtype === "storage_loss") return "Hao hụt kho";
    if (movement.movementSubtype === "sale_consumption") return "Tiêu hao bán";
    if (movement.movementSubtype === "writeoff") return "Hủy / ghi hao";
    if (movement.movementSubtype === "other") return "Xuất khác";
    return "Xuất kho";
  }
  if (movement.type === "writeoff") return "Hủy / ghi hao";
  return movement.type.replaceAll("_", " ");
}

function movementReference(movement: StockMovementHistory): string | null {
  if (movement.grnId != null) return `GRN #${movement.grnId}`;
  if (movement.transferId != null) return `Điều chuyển #${movement.transferId}`;
  if (movement.issueId != null) return `Phiếu xuất #${movement.issueId}`;
  if (movement.productionOrderId != null)
    return `Lệnh SX #${movement.productionOrderId}`;
  if (movement.orderId != null) return `Đơn bán #${movement.orderId}`;
  return null;
}

function movementVariant(quantityChange: number): MovementBadgeVariant {
  if (quantityChange > 0) return "success";
  if (quantityChange < 0) return "destructive";
  return "secondary";
}

function SummaryMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning" | "muted";
}) {
  return (
    <div className="flex min-w-fit items-center gap-2 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "warning" && "text-destructive",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function QuickActionButton({
  href,
  icon: Icon,
  label,
  primary,
}: {
  href: string;
  icon: typeof IconReceipt;
  label: string;
  primary?: boolean;
}) {
  return (
    <Button asChild size="sm" variant={primary ? "default" : "outline"}>
      <Link href={href}>
        <Icon className="size-3.5" />
        {label}
      </Link>
    </Button>
  );
}

export function StockClient({
  ingredients,
  branchId,
  branchValue,
  totalValue,
  summary,
  permissions,
  movementHistory,
}: {
  ingredients: StockIngredient[];
  branchId: number;
  branchValue: number | null;
  totalValue: number | null;
  summary: StockWorkSummary;
  permissions: StockActionPermissions;
  movementHistory: StockMovementHistory[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [selectedId, setSelectedId] = useState<number | null>(
    ingredients[0]?.id ?? null,
  );
  const [adjustTarget, setAdjustTarget] = useState<StockIngredient | null>(
    null,
  );

  const categories = useMemo(() => {
    const values = [
      ...new Set(
        ingredients.map((ingredient) => ingredient.category).filter(Boolean),
      ),
    ];
    values.sort((left, right) => left.localeCompare(right, "vi"));
    return values;
  }, [ingredients]);

  const filtered = useMemo(() => {
    let result = ingredients;

    if (activeCategory !== "all") {
      result = result.filter(
        (ingredient) => ingredient.category === activeCategory,
      );
    }

    if (stockFilter === "in_stock") {
      result = result.filter(
        (ingredient) =>
          ingredient.status === "normal" || ingredient.status === "over",
      );
    } else if (stockFilter === "low") {
      result = result.filter((ingredient) => ingredient.status === "low");
    } else if (stockFilter === "out") {
      result = result.filter((ingredient) => ingredient.status === "out");
    }

    if (riskFilter === "reorder") {
      result = result.filter(isReorderRisk);
    } else if (riskFilter === "not_counted") {
      result = result.filter((ingredient) => ingredient.lastCount === "—");
    }

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      result = result.filter(
        (ingredient) =>
          ingredient.name.toLowerCase().includes(query) ||
          ingredient.sku.toLowerCase().includes(query),
      );
    }

    const sorted = [...result];
    if (sortMode === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "vi"));
    } else if (sortMode === "value_desc") {
      sorted.sort((a, b) => stockValue(b) - stockValue(a));
    } else {
      sorted.sort(
        (a, b) =>
          STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] ||
          Number(isReorderRisk(b)) - Number(isReorderRisk(a)) ||
          a.name.localeCompare(b.name, "vi"),
      );
    }

    return sorted;
  }, [
    ingredients,
    activeCategory,
    stockFilter,
    riskFilter,
    searchQuery,
    sortMode,
  ]);

  const selected =
    filtered.find((ingredient) => ingredient.id === selectedId) ??
    filtered[0] ??
    null;
  const historyByIngredient = useMemo(() => {
    const history = new Map<number, StockMovementHistory[]>();
    for (const movement of movementHistory) {
      const list = history.get(movement.ingredientId) ?? [];
      if (list.length < 5) {
        list.push(movement);
        history.set(movement.ingredientId, list);
      }
    }
    return history;
  }, [movementHistory]);
  const selectedHistory = selected
    ? (historyByIngredient.get(selected.id) ?? [])
    : [];
  const filteredValue = filtered.reduce(
    (sum, item) => sum + stockValue(item),
    0,
  );
  const visibleTotalValue = branchValue ?? filteredValue;
  const liveLabel = new Date().toLocaleDateString("vi-VN");

  return (
    <>
      <InventoryHeader
        title="Tồn kho"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:inline-flex">
              {liveLabel}
            </Badge>
            <Badge variant="success">Live</Badge>
          </div>
        }
      />
      <InventoryPageContent
        width={isMobile ? "narrow" : "wide"}
        className={isMobile ? undefined : "p-3"}
        contentClassName={isMobile ? undefined : "max-w-none gap-2"}
      >
        <div className="flex flex-wrap items-center gap-2 border bg-card p-2">
          {permissions.canReceiveGrn ? (
            <QuickActionButton
              href={branchHref(branchId, "/inventory/grn")}
              icon={IconReceipt}
              label="Nhận GRN"
              primary
            />
          ) : null}
          {permissions.canCreateTransfer ? (
            <QuickActionButton
              href={branchHref(branchId, "/inventory/transfers")}
              icon={IconTruck}
              label="Điều chuyển"
            />
          ) : null}
          {permissions.canCreateStocktake ? (
            <QuickActionButton
              href={branchHref(branchId, "/inventory/stocktake")}
              icon={IconClipboardList}
              label="Kiểm kê"
            />
          ) : null}
          {permissions.canWriteoff ? (
            <QuickActionButton
              href={branchHref(branchId, "/inventory/waste/new")}
              icon={IconTrash}
              label="Hao hụt"
            />
          ) : null}
          {permissions.canCreatePurchaseOrder ? (
            <QuickActionButton
              href={branchHref(branchId, "/inventory/purchase-orders/new")}
              icon={IconShoppingCart}
              label="Đề xuất mua"
            />
          ) : null}

          <InputGroup className={cn("min-w-56 flex-1", isMobile && "h-12")}>
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tìm nhanh: tên hoặc SKU"
              inputMode="search"
            />
          </InputGroup>
        </div>

        <div className="flex flex-wrap items-center divide-x overflow-hidden border bg-card">
          <SummaryMetric
            label="Kho chọn"
            value={`${formatVND(visibleTotalValue)} đ`}
          />
          {totalValue != null ? (
            <SummaryMetric
              label="Toàn hệ thống"
              value={`${formatVND(totalValue)} đ`}
            />
          ) : null}
          <SummaryMetric
            label="Dưới ngưỡng"
            value={String(summary.underThresholdCount)}
            tone={summary.underThresholdCount > 0 ? "warning" : "muted"}
          />
          <SummaryMetric
            label="Cận date"
            value={String(summary.expiryCount)}
            tone={summary.expiryCount > 0 ? "warning" : "muted"}
          />
          <SummaryMetric
            label="Chờ xử lý"
            value={String(summary.pendingWorkCount)}
            tone={summary.pendingWorkCount > 0 ? "warning" : "muted"}
          />
        </div>

        <InventoryFilterBar className="gap-2 p-2">
          <Select value={activeCategory} onValueChange={setActiveCategory}>
            <SelectTrigger className="min-w-40">
              <SelectValue placeholder="Danh mục" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả danh mục</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={stockFilter}
            onValueChange={(v) => setStockFilter(v as StockFilter)}
          >
            <SelectTrigger className="min-w-36">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              {stockFilterOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={riskFilter}
            onValueChange={(v) => setRiskFilter(v as RiskFilter)}
          >
            <SelectTrigger className="min-w-40">
              <SelectValue placeholder="Rủi ro" />
            </SelectTrigger>
            <SelectContent>
              {riskFilterOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={sortMode}
            onValueChange={(v) => setSortMode(v as SortMode)}
          >
            <SelectTrigger className="min-w-56">
              <SelectValue placeholder="Sắp xếp" />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Badge variant="outline" className="ml-auto">
            {filtered.length}/{ingredients.length}
          </Badge>
        </InventoryFilterBar>

        {isMobile ? (
          <div className="flex flex-col gap-2">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {searchQuery.trim()
                  ? "Không tìm thấy nguyên liệu phù hợp"
                  : "Chưa có dữ liệu tồn kho"}
              </div>
            ) : (
              filtered.map((item) => (
                <InteractiveCard
                  key={item.id}
                  minHeight="mobile"
                  padding="default"
                  className="flex-col items-stretch gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate font-semibold">{item.name}</p>
                      <div className="flex items-center gap-2">
                        {item.category ? (
                          <Badge
                            className={
                              CATEGORY_TONE_CLASS[item.category] ??
                              "bg-muted text-muted-foreground"
                            }
                          >
                            {item.category}
                          </Badge>
                        ) : null}
                        <span className="text-xs text-muted-foreground">
                          {item.sku}
                        </span>
                      </div>
                    </div>
                    <StatusBadge status={item.status} size="sm" />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Tồn khả dụng
                      </p>
                      <p
                        className={cn(
                          "font-semibold tabular-nums",
                          (item.status === "low" || item.status === "out") &&
                            "text-destructive",
                        )}
                      >
                        {formatQty(item.qty)} {item.unit}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Giá trị</p>
                      <p className="font-semibold tabular-nums">
                        {formatVND(stockValue(item))} đ
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">WAC</p>
                      <p className="tabular-nums">{formatVND(item.cost)} đ</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        Kiểm kê cuối
                      </p>
                      <p>{item.lastCount}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 border-t pt-2">
                    {permissions.canReceiveGrn ? (
                      <Button asChild size="xs" variant="outline">
                        <Link href={branchHref(branchId, "/inventory/grn")}>
                          Nhận
                        </Link>
                      </Button>
                    ) : null}
                    {permissions.canCreateTransfer ? (
                      <Button asChild size="xs" variant="outline">
                        <Link
                          href={branchHref(branchId, "/inventory/transfers")}
                        >
                          Xuất
                        </Link>
                      </Button>
                    ) : null}
                    {permissions.canCreateStocktake ? (
                      <Button asChild size="xs" variant="outline">
                        <Link
                          href={branchHref(branchId, "/inventory/stocktake")}
                        >
                          Đếm
                        </Link>
                      </Button>
                    ) : null}
                    {permissions.canAdjustException ? (
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => setAdjustTarget(item)}
                        aria-label={`Điều chỉnh ngoại lệ ${item.name}`}
                      >
                        <IconPencil />
                      </Button>
                    ) : null}
                  </div>
                </InteractiveCard>
              ))
            )}
          </div>
        ) : (
          <div className="grid overflow-hidden border bg-card lg:grid-cols-3 xl:grid-cols-4">
            <div className="min-w-0 lg:col-span-2 xl:col-span-3">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableHead className="min-w-56">Nguyên liệu</TableHead>
                      <TableHead className="min-w-32">Danh mục</TableHead>
                      <TableHead className="min-w-24 text-right">Tồn</TableHead>
                      <TableHead className="min-w-24 text-right">
                        Khả dụng
                      </TableHead>
                      <TableHead className="min-w-40 text-right">
                        Cảnh báo
                      </TableHead>
                      <TableHead className="min-w-24 text-right">WAC</TableHead>
                      <TableHead className="min-w-28 text-right">
                        Giá trị
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableEmptyStateRow
                        colSpan={7}
                        title={
                          searchQuery.trim()
                            ? "Không tìm thấy nguyên liệu phù hợp"
                            : "Chưa có dữ liệu tồn kho"
                        }
                        description={
                          searchQuery.trim()
                            ? "Thử từ khóa hoặc bộ lọc khác."
                            : "Dữ liệu tồn kho sẽ xuất hiện khi có nguyên liệu và giao dịch phát sinh."
                        }
                      />
                    ) : null}

                    {filtered.map((item) => {
                      const active = selected?.id === item.id;
                      return (
                        <TableRow
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          data-state={active ? "selected" : undefined}
                          className={cn(
                            "cursor-pointer hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                          )}
                          onClick={() => setSelectedId(item.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedId(item.id);
                            }
                          }}
                          aria-label={`Xem chi tiết ${item.name}`}
                        >
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-semibold">{item.name}</p>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span className="font-mono">{item.sku}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {item.category ? (
                              <Badge
                                className={
                                  CATEGORY_TONE_CLASS[item.category] ??
                                  "bg-muted text-muted-foreground"
                                }
                              >
                                {item.category}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-mono",
                              (item.status === "low" ||
                                item.status === "out") &&
                                "font-semibold text-destructive",
                            )}
                          >
                            {formatQty(item.qty)} {item.unit}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatQty(item.qty)} {item.unit}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <StatusBadge status={item.status} size="sm" />
                              {item.qty <= item.reorder ? (
                                <Badge variant="warning">Chạm reorder</Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatVND(item.cost)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {formatVND(stockValue(item))} đ
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <aside className="border-t bg-background/70 p-3 lg:border-l lg:border-t-0">
              {selected ? (
                <div className="flex h-full flex-col gap-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold">
                          {selected.name}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          {selected.sku}
                          {selected.category ? ` · ${selected.category}` : ""}
                        </p>
                      </div>
                      <StatusBadge status={selected.status} size="sm" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Tồn hiện tại
                      </p>
                      <p className="font-semibold tabular-nums">
                        {formatQty(selected.qty)} {selected.unit}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Giá trị tồn
                      </p>
                      <p className="font-semibold tabular-nums">
                        {formatVND(stockValue(selected))} đ
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">WAC</p>
                      <p className="tabular-nums">
                        {formatVND(selected.cost)} đ
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Kiểm kê cuối
                      </p>
                      <p>{selected.lastCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Ngưỡng min
                      </p>
                      <p className="tabular-nums">{formatQty(selected.min)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Reorder</p>
                      <p className="tabular-nums">
                        {formatQty(selected.reorder)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {permissions.canReceiveGrn ? (
                      <Button asChild size="sm">
                        <Link href={branchHref(branchId, "/inventory/grn")}>
                          <IconReceipt className="size-3.5" />
                          Nhận hàng
                        </Link>
                      </Button>
                    ) : null}
                    {permissions.canCreateTransfer ? (
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={branchHref(branchId, "/inventory/transfers")}
                        >
                          <IconTruck className="size-3.5" />
                          Xuất kho
                        </Link>
                      </Button>
                    ) : null}
                    {permissions.canCreateStocktake ? (
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={branchHref(branchId, "/inventory/stocktake")}
                        >
                          <IconClipboardList className="size-3.5" />
                          Kiểm kê
                        </Link>
                      </Button>
                    ) : null}
                    {permissions.canWriteoff ? (
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={branchHref(branchId, "/inventory/waste/new")}
                        >
                          <IconTrash className="size-3.5" />
                          Hao hụt
                        </Link>
                      </Button>
                    ) : null}
                    <Button asChild size="sm" variant="ghost">
                      <Link href={branchHref(branchId, "/inventory/reports")}>
                        <IconArrowBarRight className="size-3.5" />
                        Xem thẻ kho
                      </Link>
                    </Button>
                    {permissions.canAdjustException ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => setAdjustTarget(selected)}
                      >
                        <IconPencil className="size-3.5" />
                        Ngoại lệ
                      </Button>
                    ) : null}
                  </div>

                  <div className="space-y-2 border-t pt-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">Lịch sử</p>
                      <Badge variant="outline">
                        {selectedHistory.length}/5
                      </Badge>
                    </div>
                    {selectedHistory.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Chưa có biến động gần đây cho nguyên liệu này.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {selectedHistory.map((movement) => {
                          const reference = movementReference(movement);
                          const signedQty =
                            movement.quantityChange > 0
                              ? `+${formatQty(movement.quantityChange)}`
                              : formatQty(movement.quantityChange);

                          return (
                            <div
                              key={movement.id}
                              className="space-y-1 border bg-card px-2 py-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-medium">
                                    {movementLabel(movement)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatDateTime(movement.createdAt)}
                                  </p>
                                </div>
                                <Badge
                                  variant={movementVariant(
                                    movement.quantityChange,
                                  )}
                                  className="shrink-0"
                                >
                                  {signedQty} {selected.unit}
                                </Badge>
                              </div>
                              {reference ||
                              movement.reason ||
                              movement.unitCost != null ? (
                                <div className="space-y-0.5 text-xs text-muted-foreground">
                                  {reference ? <p>{reference}</p> : null}
                                  {movement.reason ? (
                                    <p className="break-words">
                                      {movement.reason}
                                    </p>
                                  ) : null}
                                  {movement.unitCost != null ? (
                                    <p>WAC: {formatVND(movement.unitCost)} đ</p>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
                  Chọn một nguyên liệu để xem chi tiết thao tác.
                </div>
              )}
            </aside>
          </div>
        )}

        <div className="border bg-card px-3 py-2 text-xs text-muted-foreground">
          Tổng theo bộ lọc:{" "}
          <span className="font-medium text-foreground">
            {filtered.length} mặt hàng
          </span>{" "}
          ·{" "}
          <span className="font-medium text-foreground">
            {formatVND(filteredValue)} đ
          </span>
        </div>

        {adjustTarget ? (
          <AdjustStockDialog
            open={adjustTarget !== null}
            onOpenChange={(open) => {
              if (!open) setAdjustTarget(null);
            }}
            branchId={branchId}
            ingredientId={adjustTarget.id}
            ingredientName={adjustTarget.name}
            unit={adjustTarget.unit}
            onAdjusted={() => {
              setAdjustTarget(null);
              router.refresh();
            }}
          />
        ) : null}
      </InventoryPageContent>
    </>
  );
}
