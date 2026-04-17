"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, XCircle, CheckCircle } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { InventoryHeader } from "../../_components/inventory-header";
import { TimelineStepper } from "../../_components/timeline-stepper";
import { formatVND } from "../../_lib/format";
import { tRoute } from "../../_lib/dictionary";
import {
  createGrnFromPo,
  updatePurchaseOrderStatus,
} from "../../procurement-actions";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../../_lib/ui";

export type PODetail = {
  id: number;
  code: string;
  status: string;
  supplier: string;
  date: string;
  sentAt: string;
  total: number;
  tax: number;
  grandTotal: number;
  supplierInfo: { address: string; contact: string; payment: string };
  items: Array<{
    name: string;
    sku: string;
    qty: number;
    unit: string;
    price: number;
    total: number;
    variance: number;
    trend: "up" | "down" | "stable";
  }>;
};

function VarianceBadge({ variance }: { variance: number }) {
  const variant =
    variance > 0 ? "destructive" : variance < 0 ? "success" : "secondary";
  return (
    <Badge variant={variant}>
      {variance > 0 ? "+" : ""}
      {variance}%
    </Badge>
  );
}

export function PODetailClient({ po }: { po: PODetail }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const supplierInfoAvailable = [
    po.supplierInfo.address,
    po.supplierInfo.contact,
    po.supplierInfo.payment,
  ].some((value) => value && value !== "—");
  const canSendOrCancel = po.status === "draft";
  const canCreateGrn =
    po.status === "sent" || po.status === "partially_received";

  function handleSendPo() {
    startTransition(async () => {
      const res = await updatePurchaseOrderStatus(po.id, "sent");
      if (!res.success) {
        toast.error(res.error ?? "Không thể gửi PO.");
        return;
      }
      toast.success("Đã gửi PO cho nhà cung cấp.");
      router.refresh();
    });
  }

  function handleCancelPo() {
    startTransition(async () => {
      const res = await updatePurchaseOrderStatus(po.id, "cancelled");
      if (!res.success) {
        toast.error(res.error ?? "Không thể hủy PO.");
        return;
      }
      toast.success("Đã hủy PO.");
      router.refresh();
    });
  }

  function handleCreateGrn() {
    startTransition(async () => {
      const res = await createGrnFromPo(po.id);
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không thể tạo GRN từ PO.");
        return;
      }

      const created = res.data as { id: number };
      toast.success("Đã tạo GRN từ PO.");
      router.push(`/inventory/grn/${created.id}`);
    });
  }

  return (
    <>
      <InventoryHeader
        title="Chi tiết đơn hàng"
        actions={
          <Link
            href="/inventory/purchase-orders"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <ArrowLeft className="size-4" />{" "}
            {tRoute("/inventory/purchase-orders", "heading")}
          </Link>
        }
      />
      <div className="flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-7xl space-y-6">

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">
            Nhập hàng HQ
          </p>
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">{po.code}</h1>
            <p className="text-sm text-muted-foreground">
              {`${po.supplier} • ${po.date} • Gửi NCC ${po.sentAt} • Bước mở đầu của hub procurement`}
            </p>
          </div>
        </div>
        <Badge variant={getInventoryStatusBadgeVariant(po.status)}>
          {getInventoryStatusLabel(po.status)}
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent>
          <Badge variant="secondary">
            Nhà cung cấp
          </Badge>
          <p className="mt-3 text-xl font-semibold">{po.supplier}</p>
        </CardContent></Card>
        <Card><CardContent>
          <Badge variant="secondary">
            Tổng tiền hàng
          </Badge>
          <p className="mt-3 text-xl font-semibold">
            {formatVND(po.total)} VNĐ
          </p>
        </CardContent></Card>
        <Card><CardContent>
          <Badge variant="secondary">
            Tổng cộng
          </Badge>
          <p className="mt-3 text-2xl font-semibold text-primary">
            {formatVND(po.grandTotal)}{" "}
            <span className="text-xs font-normal">VNĐ</span>
          </p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="py-6">
          <div className="flex justify-center">
            <TimelineStepper
              steps={[
                { label: "Nháp", date: po.date, completed: true },
                {
                  label: "Đã gửi",
                  date: po.sentAt,
                  completed: po.status !== "draft",
                },
                { label: "Chờ kiểm nhận", active: po.status === "sent" },
                { label: "Đã có GRN" },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader className="gap-1">
              <CardTitle>Danh mục đặt mua</CardTitle>
              <p className="text-sm text-muted-foreground">
                {`${po.items.length} mặt hàng trong đơn mua này trước khi chuyển sang bước GRN.`}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="space-y-3 p-6 md:hidden">
                {po.items.map((item) => (
                  <Card
                    key={item.sku}
                    className="bg-muted/20"
                  ><CardContent>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.sku}
                        </p>
                      </div>
                      <VarianceBadge variance={item.variance} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Số lượng</p>
                        <p className="font-semibold">
                          {item.qty} {item.unit}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Đơn giá</p>
                        <p className="font-semibold">
                          {formatVND(item.price)}đ
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Thành tiền</p>
                        <p className="font-semibold text-primary">
                          {formatVND(item.total)}đ
                        </p>
                      </div>
                    </div>
                  </CardContent></Card>
                ))}
              </div>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      {[
                        { label: "Mặt hàng", align: "" },
                        { label: "Số lượng", align: "text-right" },
                        { label: "Đơn giá", align: "text-right" },
                        { label: "Thành tiền", align: "text-right" },
                        { label: "Biến động giá", align: "text-right" },
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
                    {po.items.map((item) => (
                      <TableRow
                        key={item.sku}
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
                          {item.qty}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                          {formatVND(item.price)}đ
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right font-mono tabular-nums font-semibold">
                          {formatVND(item.total)}đ
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right">
                          <VarianceBadge variance={item.variance} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="border-border">
                      <TableCell
                        colSpan={3}
                        className="px-6 py-3 text-right text-sm text-muted-foreground"
                      >
                        Tổng tiền hàng
                      </TableCell>
                      <TableCell className="px-6 py-3 text-right font-mono tabular-nums font-semibold">
                        {formatVND(po.total)}đ
                      </TableCell>
                      <TableCell />
                    </TableRow>
                    <TableRow className="border-border">
                      <TableCell
                        colSpan={3}
                        className="px-6 py-3 text-right text-sm text-muted-foreground"
                      >
                        Thuế (VAT 8%)
                      </TableCell>
                      <TableCell className="px-6 py-3 text-right font-mono tabular-nums">
                        {formatVND(po.tax)}đ
                      </TableCell>
                      <TableCell />
                    </TableRow>
                    <TableRow className="border-border">
                      <TableCell
                        colSpan={3}
                        className="px-6 py-3 text-right text-sm font-bold"
                      >
                        Tổng cộng
                      </TableCell>
                      <TableCell className="px-6 py-3 text-right font-mono tabular-nums font-bold text-primary">
                        {formatVND(po.grandTotal)}đ
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tóm tắt đơn mua</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Số mặt hàng</span>
                <span className="font-semibold">{po.items.length}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Tổng tiền hàng</span>
                <span className="font-semibold">{formatVND(po.total)}đ</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Thuế</span>
                <span className="font-semibold">{formatVND(po.tax)}đ</span>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-muted-foreground">Tổng cộng</p>
                <p className="mt-1 text-2xl font-black text-primary">
                  {formatVND(po.grandTotal)}đ
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Thông tin NCC</CardTitle>
            </CardHeader>
            <CardContent>
              {supplierInfoAvailable ? (
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Địa chỉ xuất hóa đơn
                    </p>
                    <p className="mt-1 font-medium">
                      {po.supplierInfo.address}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Người liên hệ
                    </p>
                    <p className="mt-1 font-medium">
                      {po.supplierInfo.contact}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Hạn thanh toán
                    </p>
                    <p className="mt-1 font-medium">
                      {po.supplierInfo.payment}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Chưa có thêm thông tin nhà cung cấp trong đơn mua này.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <footer className="flex flex-col gap-3 border-t border-border py-6 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          disabled={isPending || !canSendOrCancel}
          className="min-h-11 rounded-full px-6 font-bold text-destructive"
          onClick={handleCancelPo}
        >
          <XCircle className="size-5" />
          Hủy PO
        </Button>
        <Button
          type="button"
          disabled={isPending || (!canSendOrCancel && !canCreateGrn)}
          className="min-h-11 rounded-full px-10 font-bold shadow-lg"
          onClick={canSendOrCancel ? handleSendPo : handleCreateGrn}
        >
          <CheckCircle className="size-5" />
          {canSendOrCancel ? "Gửi PO cho NCC" : "Sang bước tạo GRN"}
        </Button>
      </footer>
    </div>
    </div>
    </>
  );
}
