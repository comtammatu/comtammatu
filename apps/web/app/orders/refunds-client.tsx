"use client";

import { useState, useTransition } from "react";
import { RotateCcw as IconRotate, CircleCheck as IconCircleCheck, CircleX as IconCircleX } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
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
import { approveRefund, fetchRefunds } from "./refund-actions";
import type { RefundRow } from "./refund-actions";
import { TableEmptyStateRow } from "@/admin/components/table-empty-state-row";

/* ─── Status helpers ─── */

const REFUND_STATUS_LABELS: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};

function refundStatusTone(
  status: string,
): "neutral" | "warning" | "success" | "danger" {
  switch (status) {
    case "pending":
      return "warning";
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}

/* ─── Props ─── */

interface RefundsClientProps {
  initialRefunds: RefundRow[];
  canApprove: boolean;
}

/* ─── Component ─── */

export function RefundsClient({
  initialRefunds,
  canApprove,
}: RefundsClientProps) {
  const [refunds, setRefunds] = useState<RefundRow[]>(initialRefunds);
  const [isPending, startTransition] = useTransition();
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pendingCount = refunds.filter(
    (refund) => refund.status === "pending",
  ).length;
  const approvedCount = refunds.filter(
    (refund) => refund.status === "approved",
  ).length;
  const totalRefundAmount = refunds.reduce(
    (sum, refund) => sum + Number(refund.amount),
    0,
  );

  function refreshRefunds() {
    startTransition(async () => {
      const result = await fetchRefunds();
      if (result.success && result.data) {
        setRefunds(result.data.refunds);
      }
    });
  }

  function handleApprove(refundId: number, approved: boolean) {
    setActioningId(refundId);
    setErrorMsg(null);
    startTransition(async () => {
      const result = await approveRefund({ refundId, approved });
      if (result.success) {
        await refreshRefunds();
      } else {
        setErrorMsg(result.error ?? "Có lỗi xảy ra");
      }
      setActioningId(null);
    });
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-muted/30 text-card-foreground p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Chờ duyệt
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {pendingCount}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Các yêu cầu cần quyết định ngay.
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 text-card-foreground p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Đã duyệt
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {approvedCount}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Yêu cầu đã được xử lý trong danh sách hiện tại.
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 text-card-foreground p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Tổng giá trị
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {formatVND(totalRefundAmount)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tổng số tiền hòan của tập kết quả đang xem.
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-card text-card-foreground shadow-sm flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Điều phối hòan tiền
          </p>
          <p className="text-sm text-muted-foreground">
            {refunds.length} yêu cầu hòan tiền trong danh sách hiện tại.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning" className="rounded-full px-3 py-1.5">
              {pendingCount} chờ duyệt
            </Badge>
            <Badge variant="success" className="rounded-full px-3 py-1.5">
              {approvedCount} đã duyệt
            </Badge>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshRefunds}
          disabled={isPending}
        >
          {isPending ? (
            <Spinner className="mr-1.5 size-3.5" />
          ) : (
            <IconRotate className="mr-1.5 size-3.5" />
          )}
          Làm mới
        </Button>
      </div>

      {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Yêu cầu hòan tiền</CardTitle>
          <p className="text-sm text-muted-foreground">
            Duyệt, từ chối và rà soát các yêu cầu hòan tiền tại một nơi.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {refunds.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 text-card-foreground border-dashed px-6 py-16 text-center">
              <IconRotate className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">
                Không có yêu cầu hòan tiền nào
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Dữ liệu trống cho bộ lọc hiện tại.
              </p>
            </div>
          ) : null}

          <div className="space-y-3 md:hidden">
            {refunds.map((refund) => (
              <div
                key={refund.id}
                className="rounded-lg border bg-muted/30 text-card-foreground p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-medium">
                      {refund.order_number}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {refund.branch_name}
                    </p>
                  </div>
                  <Badge
                    variant={
                      refundStatusTone(refund.status) === "warning"
                        ? "warning"
                        : refundStatusTone(refund.status) === "success"
                          ? "success"
                          : refundStatusTone(refund.status) === "danger"
                            ? "destructive"
                            : "secondary"
                    }
                  >
                    {REFUND_STATUS_LABELS[refund.status] ?? refund.status}
                  </Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Số tiền</p>
                    <p className="mt-1 font-mono font-medium">
                      {formatVND(refund.amount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Người tạo</p>
                    <p className="mt-1 font-medium">{refund.created_by_name}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Lý do</p>
                    <p className="mt-1">{refund.reason}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {new Date(refund.created_at).toLocaleString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {canApprove && refund.status === "pending" ? (
                    <div className="flex w-full gap-2 sm:w-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-success/20 text-success hover:bg-success/10 hover:text-success sm:flex-none"
                        disabled={isPending && actioningId === refund.id}
                        onClick={() => handleApprove(refund.id, true)}
                      >
                        {isPending && actioningId === refund.id ? (
                          <Spinner className="size-3.5" />
                        ) : (
                          <IconCircleCheck className="size-3.5" />
                        )}
                        <span className="ml-1">Duyệt</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive sm:flex-none"
                        disabled={isPending && actioningId === refund.id}
                        onClick={() => handleApprove(refund.id, false)}
                      >
                        {isPending && actioningId === refund.id ? (
                          <Spinner className="size-3.5" />
                        ) : (
                          <IconCircleX className="size-3.5" />
                        )}
                        <span className="ml-1">Từ chối</span>
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {refund.approved_by_name ?? "—"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-3xl md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã đơn</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Chi nhánh
                  </TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                  <TableHead className="hidden md:table-cell">Lý do</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Người tạo
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Thời gian
                  </TableHead>
                  <TableHead>Trạng thái</TableHead>
                  {canApprove && (
                    <TableHead className="text-right">Hành động</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {refunds.length === 0 && (
                  <TableEmptyStateRow
                    colSpan={canApprove ? 8 : 7}
                    paddingClassName="py-16"
                    title="Không có yêu cầu hòan tiền nào"
                    description="Dữ liệu trống cho bộ lọc hiện tại."
                    icon={
                      <IconRotate className="mx-auto size-8 text-muted-foreground" />
                    }
                  />
                )}
                {refunds.map((refund) => (
                  <TableRow key={refund.id}>
                    <TableCell>
                      <span className="font-mono text-sm font-medium">
                        {refund.order_number}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm">
                      {refund.branch_name}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatVND(refund.amount)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm max-w-xs truncate">
                      {refund.reason}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">
                      {refund.created_by_name}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {new Date(refund.created_at).toLocaleString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          refundStatusTone(refund.status) === "warning"
                            ? "warning"
                            : refundStatusTone(refund.status) === "success"
                              ? "success"
                              : refundStatusTone(refund.status) === "danger"
                                ? "destructive"
                                : "secondary"
                        }
                      >
                        {REFUND_STATUS_LABELS[refund.status] ?? refund.status}
                      </Badge>
                    </TableCell>
                    {canApprove && (
                      <TableCell className="text-right">
                        {refund.status === "pending" ? (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-success/20 text-success hover:bg-success/10 hover:text-success"
                              disabled={isPending && actioningId === refund.id}
                              onClick={() => handleApprove(refund.id, true)}
                            >
                              {isPending && actioningId === refund.id ? (
                                <Spinner className="size-3.5" />
                              ) : (
                                <IconCircleCheck className="size-3.5" />
                              )}
                              <span className="ml-1 hidden sm:inline">
                                Duyệt
                              </span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              disabled={isPending && actioningId === refund.id}
                              onClick={() => handleApprove(refund.id, false)}
                            >
                              {isPending && actioningId === refund.id ? (
                                <Spinner className="size-3.5" />
                              ) : (
                                <IconCircleX className="size-3.5" />
                              )}
                              <span className="ml-1 hidden sm:inline">
                                Từ chối
                              </span>
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {refund.approved_by_name ?? "—"}
                          </span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
