"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: refunds review surface keeps operational copy inline */

import { useState, useTransition } from "react";
import {
  RotateCcw as IconRotate,
  CircleCheck as IconCircleCheck,
  CircleX as IconCircleX,
} from "lucide-react";
import { formatCount, formatVND } from "@comtammatu/shared/format";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { approveRefund, fetchRefunds } from "./refund-actions";
import type { RefundRow } from "./refund-actions";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";

/* ─── Status helpers ─── */

import { BRANCH_VI, FORM_VI, STATES_VI } from "@comtammatu/shared/messages";
import { StatusBadge } from "@/components/status-badge";
import { KpiCard } from "@/components/kpi/kpi-card";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { AppSection, AppToolbar } from "@/components/surface";
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

  async function handleApprove(refundId: number, approved: boolean) {
    if (approved) {
      const refund = refunds.find((item) => item.id === refundId);
      const ok = await confirm({
        title: "Duyệt hoàn tiền?",
        description:
          "Hành động này đảo bút toán thanh toán và không thể hoàn tác.",
        details: refund
          ? [
              { label: "Mã đơn", value: refund.order_number },
              { label: "Số tiền", value: formatVND(refund.amount) },
              { label: FORM_VI.reason, value: refund.reason },
            ]
          : undefined,
        confirmText: "Duyệt hoàn tiền",
        variant: "destructive",
      });
      if (!ok) return;
    }
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
                <div className="flex justify-end gap-2">
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
        <KpiCard
          label="Chờ duyệt"
          value={formatCount(pendingCount)}
          hint="Các yêu cầu cần quyết định ngay."
        />
        <KpiCard
          label={STATES_VI.approved}
          value={formatCount(approvedCount)}
          hint="Yêu cầu đã được xử lý trong danh sách hiện tại."
        />
        <KpiCard
          label="Tổng giá trị"
          value={formatVND(totalRefundAmount)}
          hint="Tổng số tiền hoàn của tập kết quả đang xem."
        />
      </div>

      <AppToolbar className="justify-between">
        <div className="flex flex-col gap-1.5">
          <SectionLabel>Điều phối hoàn tiền</SectionLabel>
          <p className="text-sm text-muted-foreground">
            {formatCount(refunds.length)} yêu cầu hoàn tiền trong danh sách hiện
            tại.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="warning">
              {formatCount(pendingCount)} chờ duyệt
            </Badge>
            <Badge variant="success">
              {formatCount(approvedCount)} đã duyệt
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
      </AppToolbar>

      {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}

      <AppSection
        title="Yêu cầu hoàn tiền"
        description="Duyệt, từ chối và rà soát các yêu cầu hoàn tiền tại một nơi."
        contentFlush
        contentScroll
      >
        <DataTable
          columns={columns}
          data={refunds}
          getRowKey={(refund) => refund.id}
          pageSize={50}
          emptyTitle="Không có yêu cầu hoàn tiền nào"
          emptyDescription="Dữ liệu trống cho bộ lọc hiện tại."
          emptyIcon={<IconRotate />}
          mobileCardRender={(refund) => (
            <Item variant="outline">
              <ItemHeader>
                <ItemContent>
                  <ItemTitle className="font-mono">
                    {refund.order_number}
                  </ItemTitle>
                  <ItemDescription>{refund.branch_name}</ItemDescription>
                </ItemContent>
                <StatusBadge domain="refund" value={refund.status} />
              </ItemHeader>
              <ItemFooter>
                <span className="text-xs text-muted-foreground">Số tiền</span>
                <span className="font-mono text-sm font-semibold tabular-nums">
                  {formatVND(refund.amount)}
                </span>
              </ItemFooter>
              <ItemFooter>
                <span className="text-xs text-muted-foreground">
                  {FORM_VI.reason}: {refund.reason}
                </span>
              </ItemFooter>
              <ItemFooter>
                <span className="text-xs text-muted-foreground">
                  {formatVNDateTime(refund.created_at)}
                </span>
                {canApprove && refund.status === "pending" ? (
                  <ItemActions className="flex-wrap justify-end">
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
                      <span className="ml-1">Duyệt</span>
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
                      <span className="ml-1">Từ chối</span>
                    </Button>
                  </ItemActions>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {refund.approved_by_name ?? "—"}
                  </span>
                )}
              </ItemFooter>
            </Item>
          )}
        />
      </AppSection>
    </>
  );
}
