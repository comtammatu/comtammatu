/**
 * Payment Provider Interface
 *
 * Tương tự Go interface — mỗi payment method (cash, VietQR)
 * implement interface này. Server action chỉ gọi qua interface,
 * không biết implementation cụ thể.
 *
 * ```
 * PaymentProvider (interface)
 *   ├── CashProvider
 *   ├── VietQRProvider
 * ```
 */

export type PaymentMethod = "cash" | "vietqr";

export interface PaymentRequest {
  tenantId: number;
  orderId: number;
  orderNumber: string;
  amount: number;
  description?: string;
}

export interface PaymentResult {
  status: "completed" | "pending" | "failed";
  providerRef: string | null;
  /** QR image URL or data for display */
  qrData?: string;
  /** Optional provider redirect URL. */
  redirectUrl?: string;
  /** Raw provider response for storage */
  providerData?: Record<string, unknown>;
}

export interface PaymentStatus {
  status: "pending" | "completed" | "failed";
  providerRef: string | null;
  paidAt: string | null;
}

export interface PaymentProvider {
  readonly method: PaymentMethod;

  /** Create a payment. Cash = instant completed. Others = pending + QR/link. */
  createPayment(request: PaymentRequest): Promise<PaymentResult>;

  /** Poll payment status (VietQR). Not all providers support this. */
  checkStatus?(providerRef: string): Promise<PaymentStatus>;
}

/**
 * Registry: get provider by method name.
 * Tương tự Go's map[string]PaymentProvider
 */
const providers = new Map<PaymentMethod, PaymentProvider>();

export function registerPaymentProvider(provider: PaymentProvider): void {
  providers.set(provider.method, provider);
}

export function getPaymentProvider(
  method: PaymentMethod,
): PaymentProvider | null {
  return providers.get(method) ?? null;
}

export function getRegisteredMethods(): PaymentMethod[] {
  return [...providers.keys()];
}
