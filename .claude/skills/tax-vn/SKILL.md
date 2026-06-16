---
name: tax-vn
description: Vietnamese tax, payroll, and e-invoice (HĐĐT) domain skill for Má Tư (Hộ Kinh Doanh / sole-proprietorship F&B). Use for any task touching thuế TNCN/PIT, thuế GTGT/VAT, hóa đơn điện tử / HĐĐT / S-invoice (Viettel), lương/payroll, BHXH/BHYT/BHTN, giảm trừ gia cảnh, ngưỡng doanh thu 1 tỷ, business form (HKD vs company), or the 2025–2026 legal framework (NĐ 70/2025, NĐ 68/2026, NĐ 141/2026, TT 152/2025, TT 32/2025, Luật TNCN 109/2025). It routes the authoritative docs and names the real compute functions — it never recites a rate, bracket, threshold, deadline, or rule from memory.
---

# tax-vn — Vietnamese tax / payroll / HĐĐT (HKD)

Domain skill for Má Tư, a **Hộ Kinh Doanh** (sole proprietorship), not a company:
no formal BCTC/VAS. This skill is a **thin adapter** — it routes to the
authoritative docs and the existing compute code. Authority lives in the docs
and code below; never restate a number or a rule here or from memory.

## Authority order (read in this order — never skip step 1)

1. `docs/ref/legal-framework-2026.md` — SSoT law register. Read FIRST for any
   tax/labor/HĐĐT rule, then cite the governing văn bản by name.
2. The domain doc for the task:
   - `docs/ref/payroll-pit.md` — lương, biểu thuế TNCN, giảm trừ gia cảnh, BHXH.
   - `docs/ref/einvoice-tax.md` — GTGT method, HĐĐT, S-invoice templates, error codes.
   - `docs/ref/labor-contracts.md` — HĐLĐ, insurance base salary, owner BHXH.
3. `docs/ref/business-context.md` — HKD model, revenue tiers, 1 tỷ threshold.
4. `docs/ref/glossary.md` — canonical terms (TNCN, GTGT, HĐĐT, BHXH, …).
5. Routing/authority rules: `docs/agent/rules/skills.md` §HKD Domain (capability
   contract) and `database.md` (migration apply rights). Repo rules win over
   this skill.

## Non-negotiable guardrails

- Never assert a tax/labor rate, bracket, threshold, or deadline from memory.
  Read it from `legal-framework-2026.md` plus the domain doc, and cite the
  văn bản.
- When a doc and the code disagree (e.g. PIT bracket count, VAT rate), STOP and
  flag it for the owner/accountant. Do not silently reconcile either side.
- `docs/ref/tax-audit-2026-06.md` is the audit of doc/code vs current law — read
  it before touching PIT brackets or the BHXH cap. Resolved 2026-06-16 (T3,
  worklog `tax-pit-bhxh-legal-versions-2026-06-16.md`): `legal-versions.ts` now
  uses the 5-bracket schedule for the whole 2026 tax year and steps the BHXH cap
  46.8M → 50.6M at 2026-07-01 (NĐ 161/2026). One owner/accountant policy choice
  remains open (NOT a code bug): H1-2026 monthly withholding may use the new
  5-bracket (installed) or conservatively stay on the old 7-bracket and true up at
  finalization — see regression rule `PAYROLL-2026-FIVE-BRACKET-AND-BHXH-CAP-STEP`.
- HKD scope only. Enterprise BCTC/VAS/audit guidance is an advanced layer
  reachable by explicit owner permission (D012/D013), not the default surface.
- Tax/payroll/HĐĐT changes are T3 (money). Follow `workflow.md`: full
  four-perspective debate before implementation; migration file before apply.
- Never commit secrets. S-invoice runs on env (`COMPANY_TAX_CODE`, `SINVOICE_*`)
  and `.mcp.json` is gitignored.

## Executable vs doc-only — call code, don't recompute

These are real exported functions. Read the source before relying on a
signature; do not reimplement the math, and do not hardcode the numbers — the
versioned tables are the source of truth.

**Payroll / TNCN — `packages/shared/src/payroll/` (executable):**
- `calculatePayrollEntry(input)` (`calculate.ts`) — full monthly row:
  BHXH/BHYT/BHTN (employee + employer), giảm trừ, taxable income, PIT, net
  salary. Resolves the legal version from `effectiveDate` or `legalVersion`.
- `getLegalVersionForPeriod(year, month)`, `getLegalVersionFor(date)`,
  `PAYROLL_LEGAL_VERSIONS` (`legal-versions.ts`) — version-aware rate / bracket /
  deduction / insurance-cap tables. The real numbers live here — read them,
  never hardcode. Types: `PayrollLegalVersion`, `PitBracket`.
  (`calculatePIT` is an internal helper — call `calculatePayrollEntry`, not it.)

**HĐĐT / S-invoice — `packages/shared/src/` (executable):**
- `deriveInvoiceTypeFromTemplate`, `buildSinvoiceTransactionUuid`,
  `buildSinvoiceItemInfo` (`providers/impl/viettel-sinvoice.ts`).
- `buildInvoiceLineItemsFromOrderItems`, `applyInvoiceLineDiscount`
  (`hddt/invoice-line-items.ts`).
- Types + provider contract: `providers/invoice.ts` (`InvoiceRequest`,
  `InvoiceReplacementContext`, `InvoiceProvider`).
- Runtime wiring: `apps/web/lib/invoice-provider-init.ts`; request builders in
  `apps/web/app/(protected)/finance/actions.ts` and
  `apps/web/lib/hddt-daily-summary.ts` (B2C daily summary).

**Doc-only (no compute function yet — cite the doc, compute carefully, and run
the T3 debate if you add code):**
- Revenue-threshold check (ngưỡng 1 tỷ/năm) — `einvoice-tax.md`,
  `business-context.md`.
- GTGT rate selection for F&B HKD (temporary vs base rate) — `einvoice-tax.md`
  §2. Do not trust the `vat_rate` system-setting default; read the doc.
- Business-tier classification (NĐ 68/2026) and dependent-qualification rules —
  `business-context.md`, `payroll-pit.md`.
- Owner BHXH obligation and year-end PIT filing forms — `payroll-pit.md`,
  `labor-contracts.md`.

## Quick start

1. Load `docs/ref/legal-framework-2026.md`, then the domain doc(s) for the task.
2. For payroll/PIT math call the payroll functions above; for HĐĐT use the HĐĐT
   helpers. Read the source first.
3. Cite every văn bản. Flag any doc↔code disagreement to the owner/accountant.
4. For implementation, run the T3 debate (`workflow.md`) and the full gates
   (`pnpm typecheck && pnpm lint && pnpm build`, plus targeted domain tests).
