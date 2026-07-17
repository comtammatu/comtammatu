"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: refunds review surface keeps operational copy inline */

import { useState, useTransition } from "react";
import {
  RotateCcw as IconRotate,
  CircleCheck as IconCircleCheck,
  CircleX as IconCircleX,
  Search as IconSearch,
  Undo2 as IconRefund,
} from "lucide-react";
import { formatCount, formatVND } from "@comtammatu/shared/format";
import { PAYMENT_METHOD_LABELS_VI } from "@comtammatu/shared/labels";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { ReasonConfirmDialog } from "@comtammatu/ui/components/reason-confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  approveRefund,
  fetchRefunds,
  lookupRefundOrderEligibility,
  refundOrderPayment,
} from "./refund-actions";
import type { RefundOrderEligibility, RefundRow } from "./refund-actions";
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
import {
  REFUND_PAYOUT_METHODS,
  type RefundPayoutMethod,
} from "@lib/refund-payout";
import { ORDERS_COPY } from "./orders-copy";
/* ─── Props ─── */

interface RefundsClientProps {
  initialRefunds: RefundRow[];
  canApprove: boolean;
  branches: { id: number; name: string }[];
}

function bankReconciliationLabel(refund: RefundRow): string {
  if (refund.payout_method !== "bank_transfer") return "Không áp dụng";
  return refund.webhook_event_id != null
    ? "Đã khớp sao kê"
    : "Chưa khớp sao kê";
}

function paymentMethodLabel(method: string | null): string {
  if (method === "cash" || method === "vietqr") {
    return PAYMENT_METHOD_LABELS_VI[method];
  }
  return method ?? "—";
}

/* ─── Component ─── */

export function RefundsClient({
  initialRefunds,
  canApprove,
  branches,
}: RefundsClientProps) {
  const [refunds, setRefunds] = useState<RefundRow[]>(initialRefunds);
  const [isPending, startTransition] = useTransition();
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBranchId, setCreateBranchId] = useState<number | null>(
    branches[0]?.id ?? null,
  );
  const [createOrderNumber, setCreateOrderNumber] = useState("");
  const [createPayoutMethod, setCreatePayoutMethod] =
    useState<RefundPayoutMethod | null>(null);
  const [createReason, setCreateReason] = useState("");
  const [eligibility, setEligibility] = useState<RefundOrderEligibility | null>(
    null,
  );
  const [checkingOrder, setCheckingOrder] = useState(false);
  const [creatingRefund, setCreatingRefund] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
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
  const createReasonLength = createReason.trim().length;
  const canCreateRefund =
    eligibility?.eligible === true &&
    eligibility.orderId != null &&
    createPayoutMethod != null &&
    createReasonLength >= 5 &&
    createReasonLength <= 500;

  async function loadRefunds() {
    const result = await fetchRefunds();
    if (result.success && result.data) {
      setRefunds(result.data.refunds);
    }
    return result;
  }

  function refreshRefunds() {
    startTransition(async () => {
      await loadRefunds();
    });
  }

  function resetCreateDialog() {
    setCreateOpen(false);
    setCreateBranchId(branches[0]?.id ?? null);
    setCreateOrderNumber("");
    setCreatePayoutMethod(null);
    setCreateReason("");
    setEligibility(null);
    setCreateError(null);
  }

  async function handleEligibilityCheck() {
    const orderNumber = createOrderNumber.trim();
    if (!createBranchId || !orderNumber) {
      setCreateError("Chọn chi nhánh và nhập mã đơn trước khi kiểm tra");
      return;
    }

    setCheckingOrder(true);
    setCreateError(null);
    setEligibility(null);
    const result = await lookupRefundOrderEligibility({
      branchId: createBranchId,
      orderNumber,
    });
    if (!result.success || !result.data) {
      setCreateError(result.error ?? ORDERS_COPY.refundFailed);
    } else {
      setEligibility(result.data);
    }
    setCheckingOrder(false);
  }

  async function handleCreateRefund() {
    if (
      !eligibility?.eligible ||
      !eligibility.orderId ||
      !createPayoutMethod ||
      createReason.trim().length < 5
    ) {
      return;
    }

    setCreatingRefund(true);
    setCreateError(null);
    const result = await refundOrderPayment({
      orderId: eligibility.orderId,
      payoutMethod: createPayoutMethod,
      reason: createReason.trim(),
    });
    if (!result.success) {
      setCreateError(result.error ?? ORDERS_COPY.refundFailed);
      setCreatingRefund(false);
      return;
    }

    await loadRefunds();
    toast.success(ORDERS_COPY.refundSuccess);
    setCreatingRefund(false);
    resetCreateDialog();
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
              {
                label: "Hoàn bằng",
                value: PAYMENT_METHOD_LABELS_VI[refund.payout_method],
              },
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
        await loadRefunds();
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
      key: "payout_method",
      header: "Hoàn bằng",
      className: "text-sm",
      render: (refund) => PAYMENT_METHOD_LABELS_VI[refund.payout_method],
    },
    {
      key: "bank_evidence",
      header: "Đối soát NH",
      className: "text-sm",
      render: bankReconciliationLabel,
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canApprove ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <IconRefund className="size-4" />
              {ORDERS_COPY.refundCreateAction}
            </Button>
          ) : null}
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
      </AppToolbar>

      <ReasonConfirmDialog
        open={createOpen}
        onOpenChange={(open) => {
          if (open) setCreateOpen(true);
          else resetCreateDialog();
        }}
        title={ORDERS_COPY.refundCreateTitle}
        description={ORDERS_COPY.refundCreateDescription}
        reasonId="refund-create-reason"
        reason={createReason}
        onReasonChange={setCreateReason}
        reasonLabel={ORDERS_COPY.refundReasonLabel}
        reasonPlaceholder={ORDERS_COPY.refundReasonPlaceholder}
        reasonMinLength={5}
        reasonTextareaProps={{
          rows: 3,
          maxLength: 500,
          disabled: creatingRefund,
        }}
        reasonControls={
          <div className="flex items-center justify-between gap-3 text-xs">
            <span>{ORDERS_COPY.refundReasonLabel}</span>
            <span className="text-muted-foreground">
              {createReasonLength}/500
            </span>
          </div>
        }
        cancelLabel="Không"
        cancelDisabled={creatingRefund}
        confirmLabel={ORDERS_COPY.refundConfirm}
        confirmVariant="destructive"
        canConfirm={canCreateRefund}
        isPending={creatingRefund}
        onConfirm={handleCreateRefund}
      >
        <Field>
          <FieldLabel>{ORDERS_COPY.refundBranchLabel}</FieldLabel>
          <Select
            value={createBranchId != null ? String(createBranchId) : undefined}
            onValueChange={(value) => {
              setCreateBranchId(Number(value));
              setEligibility(null);
              setCreateError(null);
            }}
            disabled={creatingRefund}
          >
            <SelectTrigger>
              <SelectValue placeholder={ORDERS_COPY.refundBranchPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={String(branch.id)}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="refund-create-order-number">
            {ORDERS_COPY.refundOrderLabel}
          </FieldLabel>
          <div className="flex gap-2">
            <Input
              id="refund-create-order-number"
              value={createOrderNumber}
              onChange={(event) => {
                setCreateOrderNumber(event.target.value);
                setEligibility(null);
                setCreateError(null);
              }}
              placeholder={ORDERS_COPY.refundOrderPlaceholder}
              disabled={creatingRefund}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleEligibilityCheck}
              disabled={
                checkingOrder ||
                creatingRefund ||
                !createBranchId ||
                createOrderNumber.trim().length === 0
              }
            >
              {checkingOrder ? (
                <Spinner className="size-4" />
              ) : (
                <IconSearch className="size-4" />
              )}
              {ORDERS_COPY.refundCheckAction}
            </Button>
          </div>
        </Field>

        {eligibility ? (
          <div
            role="status"
            className={
              eligibility.eligible
                ? "rounded-md border border-success/20 bg-success/10 p-3 text-sm text-success"
                : "rounded-md border border-warning/20 bg-warning/10 p-3 text-sm text-warning"
            }
          >
            <p className="font-medium">
              {eligibility.eligible
                ? ORDERS_COPY.refundEligible
                : eligibility.reason}
            </p>
            {eligibility.eligible && eligibility.amount != null ? (
              <p className="mt-1 font-mono text-xs tabular-nums">
                {formatVND(eligibility.amount)} ·{" "}
                {paymentMethodLabel(eligibility.paymentMethod)}
              </p>
            ) : null}
          </div>
        ) : null}

        <Field>
          <FieldLabel>{ORDERS_COPY.refundPayoutLabel}</FieldLabel>
          <Select
            value={createPayoutMethod ?? undefined}
            onValueChange={(value) =>
              setCreatePayoutMethod(value as RefundPayoutMethod)
            }
            disabled={!eligibility?.eligible || creatingRefund}
          >
            <SelectTrigger>
              <SelectValue placeholder={ORDERS_COPY.refundPayoutPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {REFUND_PAYOUT_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {PAYMENT_METHOD_LABELS_VI[method]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {createError ? (
          <p className="text-sm text-destructive">{createError}</p>
        ) : null}
      </ReasonConfirmDialog>

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
                <span className="text-xs text-muted-foreground">Hoàn bằng</span>
                <span className="text-sm">
                  {PAYMENT_METHOD_LABELS_VI[refund.payout_method]}
                </span>
              </ItemFooter>
              <ItemFooter>
                <span className="text-xs text-muted-foreground">
                  Đối soát NH
                </span>
                <span className="text-sm">
                  {bankReconciliationLabel(refund)}
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
