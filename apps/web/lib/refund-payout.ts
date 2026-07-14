export const REFUND_PAYOUT_METHODS = ["cash", "bank_transfer"] as const;

export type RefundPayoutMethod = (typeof REFUND_PAYOUT_METHODS)[number];
