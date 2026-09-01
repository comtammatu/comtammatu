export function calculateHddtTotal(
  paymentTotal: number,
  holidaySurcharge: number,
): number {
  const normalizedPaymentTotal = Number.isFinite(paymentTotal)
    ? Math.max(0, paymentTotal)
    : 0;
  const normalizedHolidaySurcharge = Number.isFinite(holidaySurcharge)
    ? Math.max(0, holidaySurcharge)
    : 0;

  return Math.max(0, normalizedPaymentTotal - normalizedHolidaySurcharge);
}
