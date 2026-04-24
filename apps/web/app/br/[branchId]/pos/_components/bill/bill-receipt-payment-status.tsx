"use client";

import { useEffect, useRef } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { IconCircleCheck, IconMinimize } from "@tabler/icons-react";
import { createClient } from "@comtammatu/database/supabase/client";
import type { PendingExtras } from "./bill-receipt-types";

interface BillReceiptPaymentStatusProps {
  pendingExtras: PendingExtras;
  confirmPending: boolean;
  onConfirm: () => void;
  onRealtimeConfirmed: () => void;
  onMinimize?: () => void;
}

export function BillReceiptPaymentStatus({
  pendingExtras,
  confirmPending,
  onConfirm,
  onRealtimeConfirmed,
  onMinimize,
}: BillReceiptPaymentStatusProps) {
  const paymentId = pendingExtras.payment_id;
  const confirmedRef = useRef(false);

  useEffect(() => {
    if (!paymentId) return;
    confirmedRef.current = false;
    const supabase = createClient();
    const channel = supabase
      .channel(`payments:id=${String(paymentId)}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "payments",
          filter: `id=eq.${String(paymentId)}`,
        },
        (payload) => {
          const next = payload.new as { status?: string } | null;
          if (!next || confirmedRef.current) return;
          if (next.status === "completed" || next.status === "paid") {
            confirmedRef.current = true;
            onRealtimeConfirmed();
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [paymentId, onRealtimeConfirmed]);

  return (
    <div className="rounded-lg border border-border/70 bg-card p-3">
      {pendingExtras.qr_data ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pendingExtras.qr_data}
            alt="QR thanh toán VietQR"
            className="mx-auto max-h-72 w-full max-w-72 object-contain"
          />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Khách quét để chuyển khoản.
          </p>
        </>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Khách quét QR trên phiếu tạm tính. Xác nhận khi đã nhận tiền.
        </p>
      )}
      {pendingExtras.qr_info && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-muted/50 p-2 text-xs">
          {pendingExtras.qr_info.bank_code && (
            <>
              <dt className="text-muted-foreground">Ngân hàng</dt>
              <dd className="font-medium">
                {pendingExtras.qr_info.bank_code}
              </dd>
            </>
          )}
          {pendingExtras.qr_info.account_no && (
            <>
              <dt className="text-muted-foreground">Số TK</dt>
              <dd className="font-mono font-medium">
                {pendingExtras.qr_info.account_no}
              </dd>
            </>
          )}
          {pendingExtras.qr_info.account_name && (
            <>
              <dt className="text-muted-foreground">Chủ TK</dt>
              <dd className="font-medium uppercase">
                {pendingExtras.qr_info.account_name}
              </dd>
            </>
          )}
          {pendingExtras.qr_info.amount && (
            <>
              <dt className="text-muted-foreground">Số tiền</dt>
              <dd className="font-semibold">
                {formatVND(Number(pendingExtras.qr_info.amount))}
              </dd>
            </>
          )}
          {pendingExtras.qr_info.description && (
            <>
              <dt className="text-muted-foreground">Nội dung</dt>
              <dd className="font-mono">{pendingExtras.qr_info.description}</dd>
            </>
          )}
        </dl>
      )}
      <Button
        data-testid="bill-confirm-transfer"
        type="button"
        variant="default"
        className="mt-3 h-11 w-full rounded-lg shadow-sm transition-transform hover:-translate-y-0.5"
        disabled={confirmPending || !paymentId}
        onClick={onConfirm}
      >
        {confirmPending ? (
          <Spinner className="mr-2" />
        ) : (
          <IconCircleCheck className="mr-2 size-4" />
        )}
        Đã nhận tiền — xác nhận thanh toán
      </Button>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Hệ thống sẽ tự cập nhật khi tiền về. Nếu muốn bấm thủ công, mở app ngân
        hàng để kiểm tra.
      </p>
      {onMinimize && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-9 w-full rounded-lg text-xs"
          onClick={onMinimize}
        >
          <IconMinimize className="mr-1.5 size-3.5" />
          Thu nhỏ — tiếp tục làm đơn khác
        </Button>
      )}
    </div>
  );
}
