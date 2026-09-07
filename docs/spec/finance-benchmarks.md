# Finance Operational Benchmarks & Performance Thresholds

This document defines the approved operational benchmarks and cost structure targets for the Cơm Tấm Má Tư restaurant chain, supporting the Finance Module under **ADR 0025** (*F&B Operations System*) and `docs/modules/finance.md`.

These metrics are deterministic advisory thresholds used for operational reporting, dashboard health indicators, and manager alerts. They do not trigger automated actions or replace professional accounting review.

---

## 1. Core Operating Cost Pillars

All ratios are evaluated relative to **Net Revenue** (`net_revenue_before_vat`, after discounts, before VAT):

$$\text{Ratio} = \frac{\text{Cost}}{\text{Net Revenue}} \times 100$$

| Metric | Target Benchmark | Warning Threshold | Critical Threshold | Source & SSOT |
| :--- | :---: | :---: | :---: | :--- |
| **Ingredient Cost (Food Cost %)** | $\le 35.0\%$ | $> 35.0\%$ | $> 38.0\%$ | Recorded POS ingredient cost (`inventory_value_allocations`) from active valuation cutovers. |
| **Labor Cost (Labor Cost %)** | $\le 22.0\%$ | $> 22.0\%$ | $> 25.0\%$ | Total payroll cost (`gross_total + total_insurance_employer`) from approved HR payroll periods. |
| **Other Operating Expenses (OPEX %)** | $10.0\% - 15.0\%$ | $> 15.0\%$ | $> 18.0\%$ | Posted operating expenses (`expenses` excluding startup capital, construction, and deposits). |
| **Operating Result Margin %** | $\ge 15.0\%$ | $< 12.0\%$ | $< 5.0\%$ | Period Operating Result divided by Net Revenue. |

---

## 2. Invariants & Scope Rules

1. **Revenue Zero Guard**:
   When Net Revenue $\le 0$, percentage ratios must evaluate to `null` (never divide by zero, produce `NaN`, or default to 0%).
2. **Valuation Cutover Invariant**:
   When inventory valuation cutover is inactive or unreadable, Food Cost % and Operating Result Margin % must remain uncomputed (`null`).
3. **No Double-Counting**:
   Food cost and operating expenses are mutually exclusive. Food cost comes from inventory allocations; operating expenses strictly exclude inventory movements.
4. **Advisory Non-Autonomy**:
   Deviations from these benchmarks generate advisory alerts and direct authorized managers to existing operational workflows (e.g. waste review, roster optimization). The system never autonomously alters prices, orders, or staffing.
