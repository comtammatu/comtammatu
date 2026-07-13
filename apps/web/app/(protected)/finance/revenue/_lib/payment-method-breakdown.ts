export interface PaymentMethodRevenueBreakdown {
  cash: number;
  vietqr: number;
  momo: number;
  total: number;
}

export function paymentMethodRevenueBreakdown(input: {
  totalRevenue: number;
  cashRevenue: number;
  vietqrRevenue: number;
}): PaymentMethodRevenueBreakdown {
  const total = Number.isFinite(input.totalRevenue) ? input.totalRevenue : 0;
  const cash = Number.isFinite(input.cashRevenue) ? input.cashRevenue : 0;
  const vietqr = Number.isFinite(input.vietqrRevenue) ? input.vietqrRevenue : 0;
  return {
    cash,
    vietqr,
    momo: Math.max(0, total - cash - vietqr),
    total,
  };
}
