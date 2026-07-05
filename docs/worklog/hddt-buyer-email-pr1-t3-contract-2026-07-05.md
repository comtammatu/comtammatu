# PR1 — HĐĐT buyerEmail wiring + orphan-issue surface — T3 contract

Tier: **T3** (money/HĐĐT issuance + schema migration). Debate: 4 lenses (Product, BA/domain, Senior-Dev/Data, QA/QC) — synthesized below.
Branch: `feat/hddt-buyer-email` (base origin/main). Agent has PROD SELECT-only: writes migration + code; **owner applies migration + deploys + issues**.

## Goal
Issue a per-order HĐĐT **via the app** (Viettel provider, not portal) for a **paid order with no invoice row**, capturing buyer **email** (Viettel `buyerInfo.buyerEmail`). First use: order 8338 `TC-260705-060-PH`, company buyer CÔNG TY TNHH ĐẦU TƯ THƯƠNG MẠI VÀ DỊCH VỤ KỸ THUẬT PHÚC KHANG / MST 0109429414 / Xóm 10, Xã Thanh Trì, TP Hà Nội / xuannt83@gmail.com.

## Agreements (all lenses)
- Additive optional `buyerEmail` + orphan-issue surface. Reuse `createTaxInvoice` (all guards intact) — no new write path, no double-issue. Migration additive/nullable → safe to apply before deploy.
- `provider_ref='HDDT'+lpad(orderId,28,'0')` dedups app-origin re-issue. Unique index `uq_tax_invoices_active_per_order` + active-invoice guard (`finance/actions.ts:162-213`) + 23505 catch (:385-388) = double-issue safety net.

## Decisions (conflicts resolved)
1. **POS email CUT from PR1** → PR1.1 fast-follow. PR1 = **finance-only** email. Do NOT touch `invoicePayloadSchema` (payment-actions.ts:1112) or `invoice-form-section.tsx`. Rationale: POS is the highest-traffic money path; 8338 issues from the finance orphan surface. Add a dual-schema parity regression rule instead.
2. **Orphan-issue UI is NET-NEW** (the `invoice-list.tsx:959-981` form is the Path-C replace dialog, not reusable). Build a small buyer form (name/MST/address/email).
3. **Orphan query = 2-query app-layer set-difference** (NOT a PostgREST embed — `orders`×`tax_invoices` embed hits the 42702 ambiguous `branch_id` trap and silently empties the list). No new SECURITY DEFINER RPC in PR1.
4. `buyerEmail` **forced null when `buyerNotGetInvoice`** — at BOTH provider body and action normalize. A "Bán cho người tiêu dùng" invoice must never carry a buyer email.
5. Empty-string email: schema must accept `""` (react-hook-form emits it) → `z.email(...).or(z.literal("")).optional()`, then normalize `|| undefined`.
6. Doc: `einvoice-tax.md:346` ALREADY lists `buyer_email` (doc was ahead of DB) — KEEP it; migration converges. ADD one §3.2 line: email optional delivery field, not legal content, null when khách lẻ.
7. Replace path (`replace-invoice-actions.ts`) + `reissueAllDraftInvoices` email: **OUT** (would need `replace_tax_invoice` RPC signature change / parity with existing address-drop). Do NOT half-wire. Note latent gap.
8. Migration file `20260706180000_tax_invoices_add_buyer_email.sql` (after latest `20260706170000`).

## Implementation

### A. buyerEmail wiring
1. `supabase/migrations/20260706180000_tax_invoices_add_buyer_email.sql` (new):
   ```sql
   ALTER TABLE public.tax_invoices ADD COLUMN buyer_email text;
   COMMENT ON COLUMN public.tax_invoices.buyer_email IS
     'Buyer delivery email for Viettel S-invoice (buyerInfo.buyerEmail). NULL = no buyer email (khách lẻ / buyerNotGetInvoice). App-layer written only.';
   ```
   Do NOT edit `00000000000000_baseline.sql`.
2. `corepack pnpm db:types` → regen `packages/database/src/types/database.types.ts` (do not hand-edit).
3. `packages/shared/src/providers/invoice.ts` (buyer block ~L73): add `buyerEmail?: string;` to `InvoiceRequest`.
4. `packages/shared/src/providers/impl/viettel-sinvoice.ts:604`: `buyerEmail: buyerNotGetInvoice ? null : (request.buyerEmail ?? null)` (mirror the L592-600 buyerName server-control).
5. `apps/web/app/(protected)/finance/actions.ts`:
   - `createInvoiceSchema` (L41-56): `buyerEmail: z.email({ error: "Email không hợp lệ" }).max(200).or(z.literal("")).optional()` (Zod-4 top-level `z.email`, NOT chained `.email()`).
   - normalize near L274: `const buyerEmail = buyerNotGetInvoice ? undefined : (parsed.data.buyerEmail?.trim() || undefined);` (force undefined when khách lẻ).
   - provider call (L306-321): add `buyerEmail`.
   - `invoiceWrite` (L344-365): add `buyer_email: buyerEmail ?? null` (flows through insert :374 AND retry-draft update :367-373).
   - do NOT add `buyer_email` to the guard SELECTs (L164, invoice-queries.ts:41) — keep them lockstep, unchanged.

### B. Orphan-issue finance surface
6. Read action (new, in `finance/actions.ts` or a sibling): "paid orders with no active HĐĐT", mirroring baseline `aggregate_daily_b2c_invoice` eligible predicate (baseline.sql:1212-1226): `orders.payment_status='paid' AND orders.status NOT IN ('cancelled','refunded')` MINUS (active per-order `tax_invoices` row: status IN draft/signing/submitted/issued) MINUS (active summary via `tax_invoice_orders` join, `ti.status NOT IN ('cancelled','replaced')`). Implement as **2 queries + TS set-difference** (dodge 42702). Scope tenant + branch + `INVOICE_CREATE_ROLES`/`PERMISSION_KEYS.ORDERS_WRITE`.
7. New finance route/page + list (worklist + "Xuất HĐ" CTA per ui.md job-first — NOT a KPI panel) + net-new buyer form (name/MST/address/**email**) → calls existing `createTaxInvoice`. Include a caution line (i18n): "Kiểm tra portal Viettel trước khi xuất — đơn cũ có thể đã xuất tay." Register the route in `protected-route-module-coverage.test.ts`.
8. All new Vietnamese copy via message catalogs (`FINANCE_VI` etc.), NOT inline (`i18n/no-inline-vietnamese`).

### C. Docs + regression rules
9. `docs/ref/einvoice-tax.md` §3.2: add the email-optional-delivery line (keep :346).
10. `tasks/regressions.md`: add
    - `HDDT-BUYER-FIELD-DUAL-SCHEMA-PARITY` — buyer fields must be mirrored across `createInvoiceSchema` (finance) and `invoicePayloadSchema` (POS) + `normalizeInvoicePayload`/`InvoiceFormState`/`buildInvoicePayload`, else POS drops them. (Candidate deterministic guard: buyer* key-set parity between the two schemas.)
    - `HDDT-BUYER-EMAIL-GUARD-ON-NO-BUYER` — `buyerNotGetInvoice` ⇒ `buyerEmail=null` (fold near HDDT-LEGAL-BUYER-NAME-SERVER-CONTROLLED).
    - `HDDT-VIETQR-WEBHOOK-NO-AUTO-ISSUE-INTERIM-MANUAL` — SePay webhook issues no HĐĐT (134 orphans); PR1 orphan list is interim manual visibility, systemic fix = PR2.
- No tombstone/provenance comments (owner rule).

## Tests (must add)
- `viettel-sinvoice.test.ts`: (a) buyerEmail forwarded to `body.buyerInfo.buyerEmail`; (b) absent→null; (c) extend the existing `buyerNotGetInvoice` test — pass a non-null email, assert body email === null.
- `createTaxInvoice` (no existing coverage): assert provider call receives `buyerEmail`; assert `invoiceWrite` has `buyer_email` (insert AND retry-draft). Export `createInvoiceSchema` if needed for a schema unit test.
- Schema: valid email passes; invalid rejected; `""` accepted (→ undefined after normalize); `undefined` accepted.
- No-double-issue: `queryActiveInvoiceForOrder` still blocks a 2nd issue; guard filter still exactly `cancelled/replaced/not_required`.
- Orphan query: includes paid-no-invoice; excludes unpaid, cancelled/refunded, already-per-order-invoiced, summary-junction-folded.

## Gates (lead runs FRESH in worktree, not turbo cache, no `| tail`)
```
cd /Users/luongthebinh/Downloads/comtammatu-wt-hddt-email
corepack pnpm db:types && corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test && corepack pnpm build && corepack pnpm lint:review-tier
```
Verification note must carry the `T3` token.

## Owner steps (agent cannot)
1. **Pre-check**: confirm 8338 NOT already issued on Viettel portal (only unguarded double-issue path).
2. Apply migration to PROD. 3. Deploy. 4. Issue 8338 from the orphan surface with company buyer + email. 5. Confirm buyer receipt at xuannt83@gmail.com.

## Out of scope → PR2
SePay webhook fix-forward + sweeper backfill of the 126 khách-lẻ orphans (gated on Viettel portal export + getStatus guard). 8338 handled here; PR2 must reuse `createTaxInvoice` guard + exclude now-active rows.
