"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  ArrowLeft,
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { InventoryHeader } from "../../_components/inventory-header";
import { formatVND } from "../../_lib/format";
import { confirmGrn } from "../../procurement-actions";
import { tRoute } from "../../_lib/dictionary";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../../_lib/ui";

export type GRNDetail = {
  id: number;
  code: string;
  poCode: string;
  poId?: number;
  supplier: string;
  date: string;
  total: number;
  tax: number;
  status: string;
  items: Array<{
    name: string;
    sku: string;
    required: number;
    actual: number;
    unit: string;
    cost: number;
    lot: string;
    expiry: string;
    temp: string | null;
    status: string;
  }>;
};

export function GRNDetailClient({ grn }: { grn: GRNDetail }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const qcPassed = grn.items.filter((i) => i.status === "pass").length;
  const qcWarning = grn.items.filter((i) => i.status === "warning").length;
  const canConfirm = grn.status === "draft";

  function handleConfirmGrn() {
    startTransition(async () => {
      const res = await confirmGrn(grn.id);
      if (!res.success) {
        toast.error(res.error ?? "Không thể chốt nhập kho.");
        return;
      }
      toast.success("Đã chốt nhập kho.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <InventoryHeader
        title="Chi tiết phiếu nhập"
        actions={
          <Link
            href="/inventory/grn"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <ArrowLeft className="size-4" /> {tRoute("/inventory/grn", "heading")}
          </Link>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">
            Nhập hàng HQ
          </p>
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">
              {grn.code}
            </h1>
            <p className="text-sm text-muted-foreground">
              {`${grn.supplier} • ${grn.date} • Bước kiểm nhận sau PO`}
            </p>
          </div>
        </div>
        <Badge variant={getInventoryStatusBadgeVariant(grn.status)}>
          {getInventoryStatusLabel(grn.status)}
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardContent>
          <Badge variant="secondary">
            PO liên kết
          </Badge>
          <div className="mt-3 text-lg font-semibold">
            {grn.poCode && grn.poId ? (
              <Link
                href={`/inventory/purchase-orders/${grn.poId}`}
                className="text-primary hover:underline"
              >
                {grn.poCode}
              </Link>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </CardContent></Card>
        <Card><CardContent>
          <Badge variant="secondary">
            Nhà cung cấp
          </Badge>
          <p className="mt-3 text-lg font-semibold">{grn.supplier}</p>
        </CardContent></Card>
        <Card><CardContent>
          <Badge variant="secondary">
            Tổng giá trị nhập
          </Badge>
          <p className="mt-3 text-xl font-semibold text-primary">
            {formatVND(grn.total)} VNĐ
          </p>
        </CardContent></Card>
        <Card><CardContent>
          <Badge variant="secondary">
            Thuế (VAT)
          </Badge>
          <p className="mt-3 text-xl font-semibold">{formatVND(grn.tax)} VNĐ</p>
        </CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader className="gap-1">
              <CardTitle>Danh sách mặt hàng kiểm nhận</CardTitle>
              <p className="text-sm text-muted-foreground">
                {`${grn.items.length} mặt hàng trong phiếu nhận này trước khi chốt nhập kho.`}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="space-y-3 p-4 md:hidden">
                {grn.items.map((item) => (
                  <Card
                    key={item.sku || item.name}
                    className="bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.sku}
                        </p>
                      </div>
                      {item.status === "pass" ? (
                        <CheckCircle2 className="size-4 text-success" />
                      ) : (
                        <AlertTriangle className="size-4 text-primary" />
                      )}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Yêu cầu</p>
                        <p className="mt-1 font-medium">
                          {item.required} {item.unit}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Thực nhận</p>
                        <p className="mt-1 font-medium">{item.actual}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Đơn giá</p>
                        <p className="mt-1 font-mono">
                          {formatVND(item.cost)}đ
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Nhiệt độ</p>
                        <p className="mt-1">{item.temp ?? "—"}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Số lô / HSD</p>
                        <p className="mt-1 font-mono">{item.lot}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.expiry}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      {[
                        { label: "Sản phẩm", align: "" },
                        { label: "Yêu cầu", align: "text-right" },
                        { label: "Thực nhận", align: "text-right" },
                        { label: "Đơn giá", align: "text-right" },
                        { label: "Số lô / HSD", align: "" },
                        { label: "Nhiệt độ", align: "" },
                        { label: "QC", align: "text-center" },
                      ].map((h) => (
                        <TableHead
                          key={h.label}
                          className={`px-6 py-4 whitespace-nowrap text-xs font-bold uppercase tracking-wider ${h.align}`}
                        >
                          {h.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grn.items.map((item) => (
                      <TableRow
                        key={item.sku || item.name}
                        className="group transition-colors"
                      >
                        <TableCell className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-bold">{item.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {item.sku}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                          {item.required} {item.unit}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                          <span
                            className={
                              item.actual < item.required
                                ? "font-semibold text-primary"
                                : undefined
                            }
                          >
                            {item.actual}
                          </span>
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                          {formatVND(item.cost)}đ
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <p className="font-mono font-medium">{item.lot}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.expiry}
                          </p>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          {item.temp ? (
                            <span className="font-mono">{item.temp}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-center">
                          {item.status === "pass" ? (
                            <CheckCircle2 className="mx-auto size-4 text-success" />
                          ) : (
                            <AlertTriangle className="mx-auto size-4 text-primary" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar -- 1/3 */}
        <div className="space-y-4">
          {/* Quality Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Tổng hợp chất lượng</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Hàng đạt chuẩn (QC)
                </span>
                <span className="text-lg font-bold text-success">
                  {qcPassed}/{grn.items.length}
                </span>
              </div>
              {qcWarning > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Hàng lưu/thiếu
                  </span>
                  <span className="text-lg font-bold text-primary">
                    {qcWarning}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Total value card */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="space-y-3 pt-6">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Tổng giá trị nhập
              </p>
              <p className="text-2xl font-black tabular-nums text-primary">
                {formatVND(grn.total)} VNĐ
              </p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Tổng thuế (VAT)</span>
                  <span className="font-mono tabular-nums">
                    {formatVND(grn.tax)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Phí vận chuyển</span>
                  <span className="font-mono tabular-nums">0</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer Action Bar */}
      <footer className="flex flex-col gap-3 border-t border-border py-6 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          className="justify-center text-destructive hover:bg-destructive/8 hover:text-destructive"
          disabled
        >
          <X className="size-5" />
          Hủy bỏ
        </Button>
        <Button
          type="button"
          disabled={isPending || !canConfirm}
          className="justify-center shadow-lg transition-transform hover:scale-[0.98]"
          onClick={handleConfirmGrn}
        >
          <CheckCircle className="size-5" />
          Chốt nhập kho
        </Button>
      </footer>
    </div>
  );
}
