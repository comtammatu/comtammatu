"use client";

import { useState, useTransition } from "react";
import {
  RotateCcw as IconRotate,
  CircleCheck as IconCircleCheck,
  CircleX as IconCircleX,
} from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { approveRefund, fetchRefunds } from "./refund-actions";
import type { RefundRow } from "./refund-actions";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";

/* ─── Status helpers ─── */

import { BRANCH_VI, FORM_VI, STATES_VI } from "@comtammatu/shared/messages";
import { StatusBadge } from "@/components/status-badge";
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

  const columns: DataTableColumn<RefundRow>[] = [
    {
      key: "order_number",
      header: "Mã đơn",
      render: (refund) => (
        <span className="font-mono text-sm font-medium">
          {refund.order_number}
        </span>
      ),
    },
    {
      key: "branch",
      header: BRANCH_VI.long,
      className: "text-sm",
      render: (refund) => refund.branch_name,
    },
    {
      key: "amount",
      header: "Số tiền",
      className: "text-right",
      render: (refund) => (
        <span className="font-mono font-medium tabular-nums">
          {formatVND(refund.amount)}
        </span>
      ),
    },
    {
      key: "reason",
      header: FORM_VI.reason,
      className: "max-w-xs",
      render: (refund) => (
        <span className="block truncate text-sm">{refund.reason}</span>
      ),
    },
    {
      key: "creator",
      header: "Người tạo",
      className: "text-sm",
      render: (refund) => refund.created_by_name,
    },
    {
      key: "created_at",
      header: "Thời gian",
      className: "text-sm text-muted-foreground",
      render: (refund) => formatVNDateTime(refund.created_at),
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (refund) => <StatusBadge domain="refund" value={refund.status} />,
    },
    ...(canApprove
      ? [
          {
            key: "actions",
            header: "Hành động",
            className: "text-right",
            render: (refund: RefundRow) =>
              refund.status === "pending" ? (
                <div className="flex justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-success/20 text-success hover:bg-success/10 hover:text-success"
                    disabled={isPending && actioningId === refund.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleApprove(refund.id, true);
                    }}
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
                    className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={isPending && actioningId === refund.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleApprove(refund.id, false);
                    }}
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
              ),
          },
        ]
      : []),
  ];

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Chờ duyệt
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {pendingCount}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Các yêu cầu cần quyết định ngay.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {STATES_VI.approved}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {approvedCount}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Yêu cầu đã được xử lý trong danh sách hiện tại.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Tổng giá trị
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {formatVND(totalRefundAmount)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tổng số tiền hoàn của tập kết quả đang xem.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Điều phối hoàn tiền
            </p>
            <p className="text-sm text-muted-foreground">
              {refunds.length} yêu cầu hoàn tiền trong danh sách hiện tại.
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
        </CardContent>
      </Card>

      {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Yêu cầu hoàn tiền</CardTitle>
          <p className="text-sm text-muted-foreground">
            Duyệt, từ chối và rà soát các yêu cầu hoàn tiền tại một nơi.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
<DataTable
            columns={columns}
            data={refunds}
            getRowKey={(refund) => refund.id}
            emptyTitle="Không có yêu cầu hoàn tiền nào"
            emptyDescription="Dữ liệu trống cho bộ lọc hiện tại."
            emptyIcon={<IconRotate />}
            mobileCardRender={(refund) => (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-medium">
                        {refund.order_number}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {refund.branch_name}
                      </p>
                    </div>
                    <StatusBadge domain="refund" value={refund.status} />
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
                      <p className="mt-1 font-medium">
                        {refund.created_by_name}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground">{FORM_VI.reason}</p>
                      <p className="mt-1">{refund.reason}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {formatVNDateTime(refund.created_at)}
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
                </CardContent>
              </Card>
            )}
          />
        </CardContent>
      </Card>
    </>
  );
}
