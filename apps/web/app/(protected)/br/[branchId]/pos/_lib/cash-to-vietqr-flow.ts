"use client";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { PAYMENT_METHOD_LABELS_VI } from "@comtammatu/shared/labels";
import { confirm } from "@/components/confirm-dialog";
import { messages } from "@lib/messages";
import { convertCashPaymentToVietQr } from "../payment-actions";
import { printReceipt } from "../print-actions";

export async function confirmConvertCashToVietQr(input: {
  orderNumber: string;
  amount: number;
}): Promise<boolean> {
  return confirm({
    title: messages.pos.payment.convertCashToVietQrTitle,
    description: messages.pos.payment.convertCashToVietQrDescription,
    details: [
      {
        label: messages.pos.payment.convertCashToVietQrDetailOrder,
        value: `#${input.orderNumber}`,
      },
      {
        label: messages.pos.payment.convertCashToVietQrDetailAmount,
        value: formatVND(input.amount),
      },
      {
        label: messages.pos.payment.convertCashToVietQrDetailFrom,
        value: PAYMENT_METHOD_LABELS_VI.cash,
      },
      {
        label: messages.pos.payment.convertCashToVietQrDetailTo,
        value: PAYMENT_METHOD_LABELS_VI.vietqr,
      },
    ],
    confirmText: messages.pos.payment.convertCashToVietQrConfirm,
    cancelText: ACTIONS_VI.cancel,
  });
}

export type ConvertCashToVietQrToast = {
  type: "success" | "warning" | "error";
  message: string;
};

export async function convertCashToVietQrAndPrint(
  branchId: number,
  orderId: number,
): Promise<ConvertCashToVietQrToast> {
  const converted = await convertCashPaymentToVietQr(branchId, orderId);
  if (!converted.success) {
    return {
      type: "error",
      message:
        converted.error ?? messages.pos.payment.convertCashToVietQrFailed,
    };
  }

  const printed = await printReceipt(orderId);
  if (!printed.success) {
    return {
      type: "warning",
      message: messages.pos.payment.convertCashToVietQrSuccessPrintFailed,
    };
  }
  if (printed.data?.agent_offline) {
    return {
      type: "warning",
      message: messages.pos.payment.convertCashToVietQrSuccessPrintOffline,
    };
  }
  return {
    type: "success",
    message: messages.pos.payment.convertCashToVietQrSuccess,
  };
}

export async function printPaidVietQr(
  orderId: number,
): Promise<ConvertCashToVietQrToast> {
  const printed = await printReceipt(orderId);
  if (!printed.success) {
    return {
      type: "error",
      message: printed.error ?? messages.pos.payment.printVietQrFailed,
    };
  }
  if (printed.data?.agent_offline) {
    return {
      type: "warning",
      message: messages.pos.payment.printVietQrSuccessOffline,
    };
  }
  return {
    type: "success",
    message: messages.pos.payment.printVietQrSuccess,
  };
}
