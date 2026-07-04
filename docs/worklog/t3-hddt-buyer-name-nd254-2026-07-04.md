# T3 — HĐĐT buyer-name per NĐ 254/2026 (2026-07-04)

REVIEW_TIER: T3 (money / HĐĐT wire value + prod RPC + SECURITY DEFINER migration).

## Trigger

NĐ 254/2026/NĐ-CP (issued 2026-06-30, effective **2026-07-01**, implements Luật
Quản lý thuế 108/2025/QH15). Verified against the official signed PDF on
chinhphu.vn (2026-07-04), not secondary reporting.

- **Điều 43 khoản 2** repeals NĐ 123/2020 + NĐ 70/2025 in full from 01/07/2026.
- **Phụ lục "Nội dung của hóa đơn" mục 4 điểm b**: when a consumer buyer does
  not provide tên/địa chỉ/số định danh, the invoice must display
  **"Bán cho người tiêu dùng"** — replacing the NĐ 70/2025-era wording
  "Người mua không lấy hóa đơn".
- Same Phụ lục: invoices with no buyer info / issued to a consumer cannot be
  used by a business for expense accounting or tax finalization.

Today is 2026-07-04 → the rule is already in force. This is closing a
compliance gap, not scheduling a future toggle. No date-gating.

## Empirical finding (2026-07-04)

Question: does Viettel S-invoice auto-populate the buyer-name text when we send
`buyerNotGetInvoice="1"`, so we would not need to send the phrase ourselves?

Test: demo account `0100109106-509` (Viettel public sandbox, cluster10, template
`2/001` — same mẫu-2 HĐ bán hàng type as Má Tư's F&B invoices; NOT Má Tư's real
MST `077200004194`, does not report to CQT under Má Tư). Issued one invoice with
`buyerInfo.buyerName=""` + `buyerNotGetInvoice="1"`, then downloaded the signed
XML + PDF.

Result — signed XML (the legal original):

```xml
<NMua><Ten/><MST/><DChi/>...<HVTNMHang/>...</NMua>
```

`<Ten>` (buyer org name) and `<HVTNMHang>` (Họ và tên người mua hàng) are BOTH
empty. Viettel stored exactly what we sent. The `buyerNotGetInvoice` flag did
NOT inject any standard phrase. (The demo PDF showed a cosmetic placeholder
"TEST CASE 2" — an artifact of the shared sandbox medical template, not platform
behavior; the signed XML is authoritative and it was empty.)

**Conclusion:** the buyer-name text is app-controlled. Viettel does not derive
it. Changing our constant is required and sufficient for the wire/legal value.

## Four-perspective debate

### Product / Compliance lens
- **Scope:** change the default buyer-name text emitted on HĐĐT when the buyer
  provides no info, from "Người mua không lấy hóa đơn" → "Bán cho người tiêu dùng".
- **Done =** every path that reaches Viettel/CQT emits the new phrase; docs cite
  NĐ 254; tests lock the new value; gates green.
- **Priority:** high — legal text already in force (01/07/2026), we are 3 days late.
- **Not in scope:** B2B invoices where the buyer supplies a real name/MST — those
  send the real name and are unaffected. No change to VAT rate, template, or series.

### BA / Data lens — rules, edge cases, data flow
- The default phrase is emitted on these paths, all fed by the single TS constant
  `BUYER_NOT_GET_INVOICE_NAME`:
  - B2B realtime cash (POS): `pos/payment-actions.ts` + `invoice-form-section.tsx`.
  - Finance manual issue: `finance/actions.ts`.
  - B2C daily summary issuance: `hddt-daily-summary.ts` (the value SENT to Viettel).
  - Provider fallback: `viettel-sinvoice.ts` build.
  - POS advisory preview: `invoice-form-section.tsx:125` (interpolates the constant).
- **Second, divergent source:** the B2C summary RPC `aggregate_daily_b2c_invoice`
  (baseline.sql:1287) writes a DRAFT `tax_invoices.buyer_name = 'Khách hàng không
  lấy hóa đơn'` — a THIRD wording. This draft value is NOT sent to Viettel (the TS
  constant is), so it is cosmetic (shown only in Finance invoice-list UI), but it
  diverges and should be aligned to the new phrase for consistency.
- **Historical-data rule (critical):** DO NOT backfill existing
  `tax_invoices.buyer_name` rows. Invoices issued before 01/07/2026 were valid
  under NĐ 70/2025; their stored buyer_name must keep matching what Viettel/CQT
  holds. Rewriting issued-invoice buyer names corrupts the audit trail. New
  issuance only.
- **Edge:** replacement invoices (`replace-invoice-actions.ts`) pass buyerName
  through; a replacement of a no-info invoice will carry the new phrase — correct,
  no special handling.

### Senior Dev lens — architecture, blast radius
- **SSoT:** `BUYER_NOT_GET_INVOICE_NAME` is the single TS constant behind all wire
  paths. One-line value change cascades to every TS emitter + the preview. This is
  the compliance-critical change.
- **SQL:** `aggregate_daily_b2c_invoice` is only defined in baseline (no forward
  redefinition). Postgres has no partial-body patch → a forward migration must
  `CREATE OR REPLACE` the whole function (baseline 1144–1353, SECURITY DEFINER)
  verbatim, changing ONLY the line-1287 literal. File only — owner applies to prod
  (migration file → PR → owner; no dev DB target). Risk: transcription error in a
  210-line money RPC → mitigate by byte-diffing the new function body against the
  baseline extent (only the one literal may differ).
- **UI label decision:** keep `POS_VI.buyerNoInvoice = "Người mua không lấy hóa
  đơn"` as the checkbox label — it describes the cashier's ACTION ("khách không
  lấy hóa đơn / không cung cấp thông tin"), which is distinct from the invoice
  FIELD value. Post-change the preview line will read: HĐĐT vẫn phát hành với tên
  "Bán cho người tiêu dùng" — coherent and clearer (action vs emitted text). No
  cashier retraining. If the owner later wants the label reworded, trivial follow-up.
- **Affected files:** `providers/invoice.ts`; tests `viettel-sinvoice.test.ts`,
  `pos-mandatory-invoice.test.ts`; new migration; docs `legal-framework-2026.md`,
  `einvoice-tax.md`, `pos/flows/pos-05-payment.md`, `pos/flows/pos-08-exceptions.md`;
  i18n baseline.

### QA / QC lens — tests, regressions, cross-boundary
- Update assertions pinning the old string (5 sites) to the new value.
- **Cross-boundary coherence to check:** TS constant ↔ SQL draft literal ↔ UI label
  ↔ tests ↔ i18n baseline. After the change: the constant + SQL literal both read
  "Bán cho người tiêu dùng"; the UI label intentionally stays different (documented
  above); no test still asserts the old wire value.
- `pnpm lint:i18n:baseline` — the constant is a Vietnamese literal in code; regen
  and confirm the guard count is unchanged (value change, not a new inline string).
- Regression watch: the POS mandatory-invoice test and the sinvoice build test are
  the guards that would catch a silent wire-value drift — keep them, retarget them.
- `pnpm lint:review-tier` must see the T3 token (this file + commit body).

## Unified contract

1. `packages/shared/src/providers/invoice.ts:24` —
   `BUYER_NOT_GET_INVOICE_NAME = "Bán cho người tiêu dùng"`.
2. Forward migration `CREATE OR REPLACE FUNCTION public.aggregate_daily_b2c_invoice`
   verbatim from baseline 1144–1353, changing only the draft literal
   `'Khách hàng không lấy hóa đơn'` → `'Bán cho người tiêu dùng'`. File only;
   owner applies to prod. Re-add the REVOKE/GRANT (service_role) exactly as baseline.
3. Tests: retarget `viettel-sinvoice.test.ts` (590/634/708/796) and
   `pos-mandatory-invoice.test.ts:29` to the new value.
4. Keep `POS_VI.buyerNoInvoice` checkbox label unchanged.
5. Docs: `legal-framework-2026.md` §3 (add NĐ 254 row + mark 123/2020 & 70/2025
   repealed 01/07/2026); `einvoice-tax.md` (5 buyer-name spots + cite NĐ 254);
   `pos-05-payment.md` / `pos-08-exceptions.md` (invoice-text mentions → new phrase;
   the checkbox-label mentions stay).
6. NO historical `tax_invoices` backfill.
7. Regen `pnpm lint:i18n:baseline`; gates `pnpm typecheck && pnpm lint && pnpm test`
   fresh; `pnpm lint:review-tier`. Independent reviewer pass before landing.

## Attestation

Gates (all fresh, TURBO_FORCE, 0 cached where run):
- `typecheck` = 0 (7/7). `test` = 0 (shared 44/44 incl. the two retargeted tests;
  web 520/520). `lint` = 0. Shared eslint re-run fresh = 0.
- `lint:i18n:no-grow` = OK 11 ≤ 11 (constant lives in packages/shared, not an
  apps/web inline literal → baseline unchanged).
- `lint:review-tier` = correctly reports floor **T3 (money)** for
  `providers/invoice.ts`; advisory locally because uncommitted — the committer
  MUST put a `T3` token in the commit body (this worklog is referenced).

BA rules → implementation:
- New consumer phrase on every wire path ← single constant
  `providers/invoice.ts:24` (cascades to POS cash, finance manual, B2C summary
  issuance `hddt-daily-summary.ts:145`, provider fallback
  `viettel-sinvoice.ts:588`, POS advisory preview `invoice-form-section.tsx:125`).
- B2C draft-row consistency ← forward migration
  `20260706110000_hddt_buyer_name_nd254.sql` (verified byte-identical to baseline
  1144–1353 except CREATE OR REPLACE + the one literal).
- No historical backfill ← no data-UPDATE statement added anywhere.
- Checkbox label kept as cashier-action descriptor ← `messages/pos.ts:67`
  unchanged; `pos-mandatory-invoice.test.ts:29` still green.

Out-of-scope / deferred (with reason):
- Existing `tax_invoices.buyer_name` rows NOT backfilled — issued invoices must
  keep matching what Viettel/CQT holds.
- `POS_VI.buyerNoInvoice` checkbox label deliberately not reworded (UI affordance
  ≠ invoice field); trivial owner follow-up if desired.
- Migration is file-only; owner applies to prod (migration → PR → owner; no dev
  DB target).

Learning: none new (existing SQL↔TS mirror-drift class already covered by the
worklog contract + tests).

Independent reviewer (code-reviewer, opus, separate lane): **APPROVE**, 0
blocking. SQL body verified byte-identical to baseline (single-line delta,
UTF-8 clean, dollar-quoting balanced, sort order correct); no backfill; wire
paths all emit the new phrase; label decoupling coherent. Three LOW findings:
- LOW-1 (REVOKE/GRANT omitted vs contract item 2) — **RESOLVED**: re-added the
  ACL verbatim from baseline (idempotent defense-in-depth).
- LOW-2 (einvoice-tax "backfill" wording) — **declined**: pre-existing domain
  term for prior-day B2C summary issuance, distinct from historical-data
  backfill; renaming risks cross-doc inconsistency.
- LOW-3 (verbatim-copy can rot) — no action; inherent to Postgres full-body
  replace, mitigation already documented.

## Follow-up (same day) — server-controlled buyer name (T3)

After deploy `e32344e5` went live (~17:04 ICT), prod invoices still emitted the
OLD phrase intermittently — `buyer_name` flip-flopped across `C26MAA4544`→`4562`.

Root cause (verified against prod rows + code + SW config): the buyer-name is
**client-authored**. `invoice-form-section.tsx` is `"use client"`, bundles
`BUYER_NOT_GET_INVOICE_NAME`, and ships `buyerName` in its payload
(`buildInvoicePayload:61`); `payment-actions.ts:1185` forwards the client value
straight to the provider. POS terminals run a Serwist-precached
(`skipWaiting`/`clientsClaim`, `/_next/static` CacheFirst) long-lived tab, so a
terminal not reloaded since before the deploy keeps its old in-memory bundle and
sends the pre-NĐ254 string. The server deploy alone can't fix it.

- **PM:** done = no-info invoices always carry the current legal phrase
  regardless of client bundle age.
- **BA:** rule — when `buyerNotGetInvoice` is true the buyer provided nothing, so
  the phrase is a legal constant, not user data; the real-buyer path (flag false,
  MST + name) is unchanged.
- **Dev:** single choke point `viettel-sinvoice.ts:588` — invert to
  `buyerNotGetInvoice ? BUYER_NOT_GET_INVOICE_NAME : (request.buyerName ?? "")`.
  Covers POS + finance + B2C summary (all set the flag server-side). No schema/DB
  change; no migration.
- **QA:** the "sends buyerNotGetInvoice flag" test now passes a STALE client
  `buyerName` and asserts the emitted value is the constant (locks the override);
  38/38 shared provider tests green.

Operational stopgap (owner): hard-reload each POS terminal once (content-hashed
chunks + `skipWaiting` → one reload picks up the new bundle). After this fix
deploys, the stopgap is no longer required for correctness.

Regression rule added: `HDDT-LEGAL-BUYER-NAME-SERVER-CONTROLLED`
(`tasks/regressions.md`). Learning: legally-mandated / trust-boundary invoice
fields are server-determined, never client-authored.
