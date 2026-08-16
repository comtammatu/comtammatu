/**
 * POS completed-order cash → VietQR gates. UI-only; the RPC is the
 * money boundary (`pos:confirm_payment`, completed cash, VietQR config).
 */

export function canConvertPosCashToVietQr(input: {
  status: string;
  paymentStatus: string | null;
  paymentMethod: string | null;
  canConfirmCash: boolean;
  vietQrEnabled: boolean;
}): boolean {
  return (
    input.canConfirmCash &&
    input.vietQrEnabled &&
    input.status !== "cancelled" &&
    input.paymentStatus === "paid" &&
    input.paymentMethod === "cash"
  );
}

export function canPrintPosVietQrPayment(input: {
  status: string;
  paymentStatus: string | null;
  paymentMethod: string | null;
}): boolean {
  return (
    input.status !== "cancelled" &&
    input.paymentStatus === "paid" &&
    input.paymentMethod === "vietqr"
  );
}
