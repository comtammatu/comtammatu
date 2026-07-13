export interface MomoCreateResponseSignatureInput {
  amount: number;
  message: string;
  orderId: string;
  partnerCode: string;
  payUrl?: string;
  requestId: string;
  responseTime: number;
  resultCode: number;
}

export function buildMomoCreateResponseSignatureSource(
  result: MomoCreateResponseSignatureInput,
  accessKey: string,
): string {
  return [
    `accessKey=${accessKey}`,
    `amount=${result.amount}`,
    `message=${result.message}`,
    `orderId=${result.orderId}`,
    `partnerCode=${result.partnerCode}`,
    `payUrl=${result.payUrl ?? ""}`,
    `requestId=${result.requestId}`,
    `responseTime=${result.responseTime}`,
    `resultCode=${result.resultCode}`,
  ].join("&");
}
