import type {
  PaymentProvider,
  PaymentRequest,
  PaymentResult,
} from "../payment";

/** Cash payment — instant completion, no external API */
export class CashProvider implements PaymentProvider {
  readonly method = "cash" as const;

  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    return {
      status: "completed",
      providerRef: `CASH-${request.orderId}-${Date.now()}`,
    };
  }
}
