"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
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
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  IconArrowLeft,
  IconCircleCheck,
  IconCreditCard,
  IconInfoCircle,
  IconWallet,
  IconCircleX,
} from "@tabler/icons-react";
import { InventoryHeader } from "../../_components/inventory-header";
import { formatVND, formatDate } from "../../_lib/format";
import {
  confirmSupplierReturn,
  transitionSupplierReturn,
} from "../../supplier-return-actions";

type Props = {
  data: {
    header: {
      id: number;
      return_number: string;
      status: string;
      source: string;
      reason: string;
      resolution: string;
      notes: string | null;
      total_value: number;
      created_at: string;
      confirmed_at: string | null;
      grn_id: number | null;
      suppliers: { id: number; name: string } | null;
      branches: { id: number; name: string } | null;
      goods_received_notes: { id: number; grn_number: string } | null;
    };
    lines: Array<{
      id: number;
      quantity: number;
      unit: string;
      unit_cost: number;
      total_cost: number;
      reason_detail: string | null;
      photo_url: string | null;
      ingredients: { id: number; name: string; unit: string } | null;
    }>;
  };
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  sent: "Đã gửi NCC",
  credited: "Đã nhận credit",
  refunded: "Đã hoàn tiền",
  cancelled: "Đã hủy",
};

const SOURCE_LABEL: Record<string, string> = {
  grn_reject: "Từ chối tại GRN",
  post_receipt: "Trả hàng đã nhập kho",
};

const REASON_LABEL: Record<string, string> = {
  damaged: "Hư hỏng",
  wrong_item: "Sai mặt hàng",
  expired: "Hết hạn",
  quality_fail: "Không đạt QC",
  short_delivery_credit: "Thiếu hàng (credit)",
  other: "Khác",
};

const RESOLUTION_LABEL: Record<string, string> = {
  replacement: "NCC giao bù",
  credit_note: "Credit note",
  cash_refund: "Hoàn tiền mặt",
};

export function SupplierReturnDetailClient({ data }: Props) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const { header, lines } = data;
  const canConfirm = header.status === "draft";
  const canTransitionCredit =
    header.status === "sent" && header.resolution === "credit_note";
  const canTransitionRefund =
    header.status === "sent" && header.resolution === "cash_refund";
  const canCancel = header.status === "draft" || header.status === "sent";

  function handleConfirm() {
    start(async () => {
      const res = await confirmSupplierReturn(header.id);
      if (!res.success) {
        toast.error(res.error ?? "Không thể xác nhận phiếu trả.");
        return;
      }
      toast.success("Đã xác nhận phiếu trả NCC.");
      router.refresh();
    });
  }

  function handleTransition(target: "credited" | "refunded" | "cancelled") {
    start(async () => {
      const res = await transitionSupplierReturn({
        returnId: header.id,
        targetStatus: target,
        notes: null,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không thể chuyển trạng thái.");
        return;
      }
      const result = res.data as { credit_number?: string } | undefined;
      const msg =
        target === "credited"
          ? `Đã ghi credit note${result?.credit_number ? ` ${result.credit_number}` : ""}.`
          : target === "refunded"
            ? `Đã ghi hoàn tiền${result?.credit_number ? ` ${result.credit_number}` : ""}.`
            : "Đã hủy phiếu trả.";
      toast.success(msg);
      router.refresh();
    });
  }

  return (
    <>
      <InventoryHeader
        title={`Phiếu trả NCC ${header.return_number}`}
        actions={
          <Link
            href="/inventory/supplier-returns"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <IconArrowLeft className="size-4" /> Danh sách phiếu trả
          </Link>
        }
      />
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-6xl space-y-6">
          {header.source === "post_receipt" && header.status === "draft" ? (
            <Alert>
              <IconInfoCircle className="size-4" />
              <AlertDescription>
                Phiếu trả này sẽ ghi giảm tồn kho khi xác nhận. Đảm bảo NCC đã
                đồng ý nhận lại trước khi nhấn xác nhận.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            <SummaryCard label="Trạng thái">
              <Badge>{STATUS_LABEL[header.status] ?? header.status}</Badge>
            </SummaryCard>
            <SummaryCard label="Nhà cung cấp">
              {header.suppliers?.name ?? "—"}
            </SummaryCard>
            <SummaryCard label="Kho">{header.branches?.name ?? "—"}</SummaryCard>
            <SummaryCard label="Tổng giá trị">
              <span className="text-primary">
                {formatVND(Number(header.total_value ?? 0))} ₫
              </span>
            </SummaryCard>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Thông tin</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-3">
              <Row label="Nguồn">{SOURCE_LABEL[header.source] ?? header.source}</Row>
              <Row label="Lý do">{REASON_LABEL[header.reason] ?? header.reason}</Row>
              <Row label="Cách xử lý">
                {RESOLUTION_LABEL[header.resolution] ?? header.resolution}
              </Row>
              {header.goods_received_notes ? (
                <Row label="GRN liên kết">
                  <Link
                    href={`/inventory/grn/${header.goods_received_notes.id}`}
                    className="text-primary hover:underline"
                  >
                    {header.goods_received_notes.grn_number}
                  </Link>
                </Row>
              ) : null}
              <Row label="Tạo lúc">{formatDate(header.created_at)}</Row>
              {header.confirmed_at ? (
                <Row label="Xác nhận lúc">{formatDate(header.confirmed_at)}</Row>
              ) : null}
              {header.notes ? (
                <Row label="Ghi chú">{header.notes}</Row>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Mặt hàng trả</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nguyên liệu</TableHead>
                    <TableHead className="text-right">Số lượng</TableHead>
                    <TableHead className="text-right">Đơn giá</TableHead>
                    <TableHead className="text-right">Thành tiền</TableHead>
                    <TableHead>Lý do chi tiết</TableHead>
                    <TableHead>Ảnh</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{l.ingredients?.name ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">
                        {l.quantity} {l.unit}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatVND(Number(l.unit_cost))} ₫
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {formatVND(Number(l.total_cost))} ₫
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {l.reason_detail ?? "—"}
                      </TableCell>
                      <TableCell>
                        {l.photo_url ? (
                          <a
                            href={l.photo_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            xem ảnh
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <footer className="flex flex-col items-stretch gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button asChild variant="ghost">
              <Link href="/inventory/supplier-returns">
                <IconArrowLeft className="size-4" /> Quay lại
              </Link>
            </Button>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {canCancel ? (
                <Button
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/8"
                  onClick={() => handleTransition("cancelled")}
                  disabled={isPending}
                >
                  <IconCircleX className="size-4" /> Hủy phiếu
                </Button>
              ) : null}
              {canConfirm ? (
                <Button onClick={handleConfirm} disabled={isPending}>
                  <IconCircleCheck className="size-4" /> Xác nhận / Gửi NCC
                </Button>
              ) : null}
              {canTransitionCredit ? (
                <Button onClick={() => handleTransition("credited")} disabled={isPending}>
                  <IconCreditCard className="size-4" /> Ghi nhận credit note
                </Button>
              ) : null}
              {canTransitionRefund ? (
                <Button onClick={() => handleTransition("refunded")} disabled={isPending}>
                  <IconWallet className="size-4" /> Ghi nhận hoàn tiền
                </Button>
              ) : null}
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}

function SummaryCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent>
        <Badge variant="secondary">{label}</Badge>
        <div className="mt-3 text-lg font-semibold">{children}</div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}
