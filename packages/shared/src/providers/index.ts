// Interfaces
export type {
  PaymentProvider,
  PaymentMethod,
  PaymentRequest,
  PaymentResult,
  PaymentStatus,
  WebhookVerification,
} from "./payment";
export {
  registerPaymentProvider,
  getPaymentProvider,
  getRegisteredMethods,
} from "./payment";

export type {
  InvoiceProvider,
  InvoiceRequest,
  InvoiceResult,
  InvoiceStatus,
  InvoiceLineItem,
} from "./invoice";
export { setInvoiceProvider, getInvoiceProvider } from "./invoice";
export {
  CANONICAL_INVOICE_PROVIDER,
  LEGACY_INVOICE_PROVIDER,
  normalizeInvoiceProviderChoice,
} from "./invoice-provider-policy";
export type { InvoiceProviderChoice } from "./invoice-provider-policy";

// Implementations
export { CashProvider } from "./impl/cash";
export {
  VietQRProvider,
  buildVietQrEmvco,
  resolveBankBin,
} from "./impl/vietqr";
export { MoMoProvider, createMoMoProviderFromEnv } from "./impl/momo";
export { MisaProvider } from "./impl/misa";
export { ViettelSinvoiceProvider } from "./impl/viettel-sinvoice";
export type { ViettelSinvoiceConfig } from "./impl/viettel-sinvoice";
