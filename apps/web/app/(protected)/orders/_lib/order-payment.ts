export interface OrderPaymentAttempt {
  id: number;
  method: string;
  amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
}

function attemptTime(attempt: OrderPaymentAttempt): number {
  return Date.parse(attempt.paid_at ?? attempt.created_at);
}

export function orderPaymentAttempts(
  payments: OrderPaymentAttempt[],
): {
  attempts: OrderPaymentAttempt[];
  canonical: OrderPaymentAttempt | null;
} {
  const attempts = [...payments].sort(
    (left, right) =>
      attemptTime(right) - attemptTime(left) || right.id - left.id,
  );

  return {
    attempts,
    canonical:
      attempts.find((payment) => payment.status === "completed") ??
      attempts[0] ??
      null,
  };
}
