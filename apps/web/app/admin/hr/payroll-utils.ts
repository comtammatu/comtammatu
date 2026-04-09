// Pure payroll calculation utilities — no server-only code

const PIT_BRACKETS: Array<{ limit: number; rate: number }> = [
  { limit: 5_000_000, rate: 0.05 },
  { limit: 10_000_000, rate: 0.1 },
  { limit: 18_000_000, rate: 0.15 },
  { limit: 32_000_000, rate: 0.2 },
  { limit: 52_000_000, rate: 0.25 },
  { limit: 80_000_000, rate: 0.3 },
  { limit: Number.MAX_SAFE_INTEGER, rate: 0.35 },
];

export function calculatePIT(monthlyTaxableIncome: number): number {
  if (monthlyTaxableIncome <= 0) return 0;

  let tax = 0;
  let previous = 0;

  for (const bracket of PIT_BRACKETS) {
    if (monthlyTaxableIncome <= previous) break;
    const taxable = Math.min(monthlyTaxableIncome, bracket.limit) - previous;
    tax += taxable * bracket.rate;
    previous = bracket.limit;
  }

  return Math.round(tax);
}
