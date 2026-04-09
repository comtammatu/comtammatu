"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ClipboardList,
  History,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@comtammatu/ui/components/tooltip";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  createGrnFromPo,
  deletePurchaseOrderLine,
  fetchPurchaseOrderDetail,
  fetchPriceDeviations,
  fetchIngredientPriceHistory,
  upsertPurchaseOrderLine,
  updatePurchaseOrderStatus,
} from "../../procurement-actions";
import type {
  LinkedGrnRow,
  PriceDeviationRow,
  PriceHistoryRow,
} from "../../procurement-actions";
import type { IngredientRow } from "../../page";

export interface PurchaseOrderDetailRecord {
  id: number;
  po_number: string;
  status: string;
  ordered_at: string;
  notes: string | null;
  supplier_id: number;
  branch_id: number;
  suppliers: { id: number; name: string } | null;
}

export interface PoLineRow {
  id: number;
  ingredient_id: number;
  quantity: number;
  unit: string;
  unit_price_est: number | null;
  line_total: number | null;
  ingredients: { id: number; name: string; unit: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  sent: "Đã gửi",
  partially_received: "Nhận một phần",
  received: "Đã nhận đủ",
  cancelled: "Đã hủy",
};

export function PoDetailClient({
  poId,
  initialPo,
  initialLines,
  ingredients,
  linkedGrns: initialLinkedGrns,
}: {
  poId: number;
  initialPo: PurchaseOrderDetailRecord;
  initialLines: PoLineRow[];
  ingredients: IngredientRow[];
  linkedGrns: LinkedGrnRow[];
}) {
  const router = useRouter();
  const [po, setPo] = useState(initialPo);
  const [lines, setLines] = useState(initialLines);
  const [linkedGrns, setLinkedGrns] = useState(initialLinkedGrns);
  const [ingredientId, setIngredientId] = useState("");
  const [unit, setUnit] = useState("");
  const [isPending, startTransition] = useTransition();

  // Price intelligence state
  const [deviations, setDeviations] = useState<Map<number, PriceDeviationRow>>(
    new Map(),
  );
  const [priceHistory, setPriceHistory] = useState<PriceHistoryRow[] | null>(
    null,
  );
  const [historyIngredientId, setHistoryIngredientId] = useState<number | null>(
    null,
  );

  // Fetch deviations when lines have prices
  useEffect(() => {
    const hasAnyPrice = lines.some((l) => l.unit_price_est != null);
    if (!hasAnyPrice) return;
    fetchPriceDeviations({ poId }).then((res) => {
      if (res.success && res.data) {
        const map = new Map<number, PriceDeviationRow>();
        for (const d of res.data as PriceDeviationRow[]) {
          map.set(d.ingredient_id, d);
        }
        setDeviations(map);
      }
    });
  }, [poId, lines]);

  function togglePriceHistory(ingredientId: number) {
    if (historyIngredientId === ingredientId) {
      setPriceHistory(null);
      setHistoryIngredientId(null);
      return;
    }
    setHistoryIngredientId(ingredientId);
    fetchIngredientPriceHistory({
      ingredientId,
      supplierId: po.supplier_id,
    }).then((res) => {
      if (res.success) {
        setPriceHistory((res.data as PriceHistoryRow[]) ?? []);
      }
    });
  }

  function handleIngredientChange(val: string) {
    setIngredientId(val);
    const ing = ingredients.find((x) => String(x.id) === val);
    if (ing) setUnit(ing.unit);
  }

  const isDraft = po.status === "draft";

  async function reload() {
    const res = await fetchPurchaseOrderDetail(poId);
    if (!res.success || !res.data) {
      toast.error("Không thể tải lại dữ liệu");
      return;
    }
    const d = res.data as {
      po: PurchaseOrderDetailRecord;
      lines: PoLineRow[];
    };
    setPo(d.po);
    setLines(d.lines);
    router.refresh();
  }

  function addLine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const iid = Number(ingredientId || fd.get("ingredientId"));
    if (!iid) {
      toast.error("Chọn nguyên liệu");
      return;
    }
    const ing = ingredients.find((x) => x.id === iid);
    const unit = String(fd.get("unit") ?? ing?.unit ?? "");
    const qty = Number(fd.get("qty"));
    const priceRaw = String(fd.get("unitPriceEst") ?? "").trim();
    const unitPriceEst = priceRaw === "" ? null : Number(priceRaw);
    if (!unit || !Number.isFinite(qty) || qty <= 0) {
      toast.error("Kiểm tra số lượng và đơn vị");
      return;
    }
    if (
      unitPriceEst != null &&
      (!Number.isFinite(unitPriceEst) || unitPriceEst < 0)
    ) {
      toast.error("Đơn giá dự kiến không hợp lệ");
      return;
    }
    startTransition(async () => {
      const res = await upsertPurchaseOrderLine({
        poId,
        ingredientId: iid,
        quantity: qty,
        unit,
        unitPriceEst,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không thể lưu dòng PO");
        return;
      }
      toast.success("Đã lưu dòng");
      setIngredientId("");
      setUnit("");
      await reload();
    });
  }

  function removeLine(lineId: number) {
    startTransition(async () => {
      const res = await deletePurchaseOrderLine({ poId, lineId });
      if (!res.success) {
        toast.error(res.error ?? "Không thể xóa dòng PO");
        return;
      }
      toast.success("Đã xóa dòng");
      await reload();
    });
  }

  function handleCreateGrn() {
    startTransition(async () => {
      const res = await createGrnFromPo(poId);
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không thể tạo phiếu nhập");
        return;
      }
      const newId = (res.data as { id: number }).id;
      setLinkedGrns((prev) => [
        {
          id: newId,
          grn_number: `GRN-...`,
          status: "draft",
          received_date: new Date().toISOString(),
        },
        ...prev,
      ]);
      router.push(`/admin/inventory/grn/${newId}`);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link href="/admin/inventory/purchase-orders">← Danh sách PO</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight font-mono">
            {po.po_number}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {po.suppliers?.name ?? "—"} ·{" "}
            {new Date(po.ordered_at).toLocaleString("vi-VN")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">
              {STATUS_LABEL[po.status] ?? po.status}
            </Badge>
          </div>
          {po.notes && (
            <p className="mt-2 text-sm text-muted-foreground">{po.notes}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {isDraft && lines.length > 0 && (
            <Button
              type="button"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  const res = await updatePurchaseOrderStatus(poId, "sent");
                  if (!res.success) {
                    toast.error(res.error ?? "Không thể gửi đơn đặt hàng");
                    return;
                  }
                  toast.success("Đã gửi PO");
                  await reload();
                });
              }}
            >
              Gửi PO cho nhà cung cấp
            </Button>
          )}
          {(po.status === "sent" || po.status === "partially_received") && (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={handleCreateGrn}
            >
              <Plus className="mr-2 size-4" />
              Tạo GRN từ PO này
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nguyên liệu</TableHead>
              <TableHead className="text-right">Số lượng</TableHead>
              <TableHead>Đơn vị</TableHead>
              <TableHead className="hidden sm:table-cell text-right">
                Đơn giá dự kiến
              </TableHead>
              <TableHead className="hidden md:table-cell text-right">
                Thành tiền
              </TableHead>
              {isDraft && <TableHead className="w-14" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={isDraft ? 6 : 5}
                  className="py-8 text-center text-muted-foreground"
                >
                  {isDraft
                    ? "Chưa có dòng — thêm nguyên liệu bên dưới."
                    : "Không có dòng chi tiết."}
                </TableCell>
              </TableRow>
            )}
            {lines.map((l) => {
              const dev = deviations.get(l.ingredient_id);
              return (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {l.ingredients?.name ?? `#${l.ingredient_id}`}
                      {l.unit_price_est != null && (
                        <button
                          type="button"
                          onClick={() => togglePriceHistory(l.ingredient_id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Lịch sử giá"
                        >
                          <History className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {l.quantity.toLocaleString("vi-VN")}
                  </TableCell>
                  <TableCell>{l.unit}</TableCell>
                  <TableCell className="hidden sm:table-cell text-right font-mono text-muted-foreground">
                    <div className="flex items-center justify-end gap-1.5">
                      {l.unit_price_est != null
                        ? `${l.unit_price_est.toLocaleString("vi-VN")} ₫`
                        : "—"}
                      {dev && <PriceDeviationBadge deviation={dev} />}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-right font-mono">
                    {l.line_total != null
                      ? `${l.line_total.toLocaleString("vi-VN")} ₫`
                      : "—"}
                  </TableCell>
                  {isDraft && (
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        disabled={isPending}
                        onClick={() => removeLine(l.id)}
                        aria-label="Xóa dòng"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Price history panel */}
      {priceHistory != null && historyIngredientId != null && (
        <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Lịch sử giá —{" "}
              {lines.find((l) => l.ingredient_id === historyIngredientId)
                ?.ingredients?.name ?? `#${historyIngredientId}`}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPriceHistory(null);
                setHistoryIngredientId(null);
              }}
            >
              Đóng
            </Button>
          </div>
          {priceHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Chưa có lịch sử nhập hàng cho nguyên liệu này.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày nhận</TableHead>
                  <TableHead>Phiếu GRN</TableHead>
                  <TableHead className="text-right">Số lượng</TableHead>
                  <TableHead>ĐV</TableHead>
                  <TableHead className="text-right">Đơn giá</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {priceHistory.map((h) => (
                  <TableRow key={h.grn_id}>
                    <TableCell className="text-sm">
                      {new Date(h.received_date).toLocaleDateString("vi-VN")}
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      <Link
                        href={`/admin/inventory/grn/${h.grn_id}`}
                        className="text-primary hover:underline"
                      >
                        {h.grn_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {h.received_quantity.toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="text-sm">{h.unit}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">
                      {h.unit_cost.toLocaleString("vi-VN")} ₫
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* Linked GRNs */}
      {(linkedGrns.length > 0 ||
        po.status === "sent" ||
        po.status === "partially_received") && (
        <div className="rounded-lg border overflow-hidden">
          <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Phiếu nhập kho liên kết</h2>
              {linkedGrns.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {linkedGrns.length}
                </Badge>
              )}
            </div>
          </div>
          {linkedGrns.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Chưa có phiếu nhập — nhấn &quot;Tạo GRN từ PO này&quot; để bắt đầu
              nhập hàng.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10 hover:bg-muted/10">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    Số phiếu
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    Trạng thái
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    Ngày nhận
                  </TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {linkedGrns.map((g) => (
                  <TableRow
                    key={g.id}
                    className="group hover:bg-muted/20 transition-colors"
                  >
                    <TableCell className="font-mono text-sm font-medium">
                      {g.grn_number}
                    </TableCell>
                    <TableCell>
                      {g.status === "confirmed" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                          <CheckCircle2 className="size-3.5" />
                          Đã nhập kho
                        </span>
                      ) : g.status === "cancelled" ? (
                        <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-xs">
                          Đã hủy
                        </Badge>
                      ) : (
                        <Badge className="bg-muted text-muted-foreground text-xs">
                          Nháp
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {new Date(g.received_date).toLocaleDateString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        asChild
                      >
                        <Link href={`/admin/inventory/grn/${g.id}`}>
                          <History className="size-4" />
                          <span className="sr-only">Xem GRN</span>
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {isDraft && (
        <form
          onSubmit={addLine}
          className="rounded-lg border bg-muted/30 p-4 space-y-3 max-w-xl"
        >
          <h2 className="font-semibold text-sm">Thêm dòng</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nguyên liệu</Label>
              <Select
                value={ingredientId}
                onValueChange={handleIngredientChange}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn" />
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
            <div className="space-y-1.5">
              <Label htmlFor="qty">Số lượng</Label>
              <Input
                id="qty"
                name="qty"
                type="number"
                step="any"
                min="0"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit">Đơn vị</Label>
              <Input
                id="unit"
                name="unit"
                required
                placeholder="kg"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="unitPriceEst">
                Đơn giá dự kiến (₫, tùy chọn)
              </Label>
              <Input
                id="unitPriceEst"
                name="unitPriceEst"
                type="number"
                step="any"
                min="0"
                placeholder="Để trống nếu chưa có"
              />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={isPending || !ingredientId}>
            {isPending ? "Đang lưu…" : "Lưu dòng"}
          </Button>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Price deviation badge with tooltip
// ---------------------------------------------------------------------------
function PriceDeviationBadge({ deviation }: { deviation: PriceDeviationRow }) {
  const isExpensive = deviation.deviation_pct > 0;
  const Icon = isExpensive ? TrendingUp : TrendingDown;
  const sign = isExpensive ? "+" : "";
  const label = `${sign}${deviation.deviation_pct}%`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold cursor-help ${
              isExpensive
                ? "bg-destructive/10 text-destructive"
                : "bg-green-500/10 text-green-700 dark:text-green-400"
            }`}
          >
            <Icon className="size-3" />
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1 text-xs">
            <p className="font-semibold">
              {isExpensive ? "Đắt hơn" : "Rẻ hơn"} trung bình{" "}
              {Math.abs(deviation.deviation_pct)}%
            </p>
            <p>
              TB {deviation.sample_count} lần gần nhất:{" "}
              <span className="font-mono font-semibold">
                {deviation.avg_price.toLocaleString("vi-VN")} ₫
              </span>
              /{deviation.unit}
            </p>
            <p>
              Giá hiện tại:{" "}
              <span className="font-mono font-semibold">
                {deviation.current_price.toLocaleString("vi-VN")} ₫
              </span>
              /{deviation.unit}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
