# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0.5] - 2026-05-09

### Repo metadata — CodeQL SAST + CONTRIBUTING.md

GitHub-native static analysis security testing (CodeQL on every push, PR, and weekly schedule with the `security-extended` query suite) plus a contributor guide aligning external contributors with `CLAUDE.md` quality gates and the 4-agent debate workflow. No source-code change.

### Added

- **`.github/workflows/codeql.yml`** — CodeQL Action v3 pinned to commit SHA `7fd177fa…` (matches `ci.yml` action-pinning convention). Languages: `javascript-typescript`. `security-events: write` permission scoped to this workflow only. Triggers: push to `main`, pull_request to `main`, weekly cron `0 3 * * 1` UTC. Concurrency group cancels stale runs.
- **`.github/CONTRIBUTING.md`** — Vietnamese + English contributor guide. References `CLAUDE.md` as canonical, lists mandatory gates (`pnpm typecheck && pnpm lint && pnpm build`), documents the 4-agent debate workflow, points security disclosures at `SECURITY.md` (no public-issue rule), explicit no-`Co-Authored-By: Claude` trailer rule.

### Owner action required

None for this release. The CodeQL workflow runs automatically on the next push to `main` (this release commit triggers the first run). The "Security" tab populates with findings (if any) within ~10 minutes of the first scan completing. The carry-over `1.2.0.1` + `1.2.0.2` alias-promotion blocker is unchanged.

## [1.2.0.4] - 2026-05-09

### Repo metadata — `.github/SECURITY.md` + Dependabot

Two new files under `.github/`: a GitHub-native Security policy (so the repo surfaces a "Security" tab pointing at our existing RFC 9116 `security.txt`) and a Dependabot configuration for monthly bundled dependency audits across pnpm + GitHub Actions. No source-code change.

### Added

- **`.github/SECURITY.md`** — Vietnamese + English security policy. Reporting flow, response SLOs (5 business days for ack, 7-90 days fix depending on severity), Supported Versions table (1.2.x supported), in-scope / out-of-scope listing, safe-harbor clause, links to existing `apps/web/public/.well-known/security.txt`.
- **`.github/dependabot.yml`** — `version: 2`. Two ecosystems: `npm` (root pnpm workspace, monthly Monday 08:00 ICT, max 5 PRs, grouped into `production-dependencies` + `dev-dependencies`, semver-major bumps ignored) and `github-actions` (monthly, max 3 PRs). Both auto-assign `comtammatu` and label PRs `dependencies`.

### Owner action required

None for this release. GitHub picks up `.github/SECURITY.md` and `.github/dependabot.yml` on the next default-branch read — no Vercel promotion needed (artifacts are GitHub-side, not deployed to `app.comtammatu.com`). The carry-over `1.2.0.1` + `1.2.0.2` alias-promotion blocker remains.

## [1.2.0.3] - 2026-05-09

### Repo metadata — CODEOWNERS + PR / issue templates

Four new files under `.github/` aligning the repo with standard GitHub conventions. No source-code change.

### Added

- **`.github/CODEOWNERS`** — `* @comtammatu` (single-tenant owner fallback). Path-specific overrides go above this rule when the team grows.
- **`.github/pull_request_template.md`** — checklist mirroring CLAUDE.md gates: typecheck/lint/build/tests, regression rule maintenance, no `Co-Authored-By: Claude` trailer, owner-action callout.
- **`.github/ISSUE_TEMPLATE/bug_report.md`** — repro / expected / actual / environment / severity, with maintainer-side triage section.
- **`.github/ISSUE_TEMPLATE/feature_request.md`** — problem / proposal / acceptance criteria / risk surface / explicit out-of-scope.

### Owner action required

None for this release. The `.github/` files take effect on the next PR / issue immediately on merge — no Vercel promotion needed because the artifacts are GitHub-side, not deployed to `app.comtammatu.com`. The carry-over `1.2.0.1` + `1.2.0.2` alias-promotion blocker is unchanged.

## [1.2.0.2] - 2026-05-09

### Web-standard hardening — robots.txt + security.txt

Two thin static-asset additions. No behavior change for end users; both target external crawlers and security researchers.

### Added

- **`apps/web/app/robots.ts`** — Next.js MetadataRoute generator. `User-agent: *` disallow for `/admin/`, `/api/`, `/login`, `/access-denied`, `/employee/`, `/br/`, `/notifications`, `/orders`, `/menu`, `/inventory/`, `/payment/`.
- **`apps/web/public/.well-known/security.txt`** (RFC 9116) — vulnerability-disclosure contact, valid through 2027-05-09. `Contact: mailto:comtammatu@gmail.com`, `Preferred-Languages: vi, en`.

### Owner action required

Same alias-promotion blocker as 1.2.0.1: the new files are NOT served by `app.comtammatu.com` until the Vercel alias is promoted to a build ≥ this commit.

---

## [Unreleased] — m4-payments-fix slice 2 (deep RPCs, 2026-04-30)

### Added

- **`reverse_payment_and_post(p_refund_id)` atomic RPC** — locks refund→payment→order, posts a balanced GL reversal journal (Dr `5111` / Cr `1111` cash or Cr `1121` bank), restores stock when consumption happened, flips `payments.status='refunded'` + `orders.payment_status='refunded'`, stamps `refund.approved_at/by`, writes one `audit_logs` row. Idempotent on already-approved refunds. Gated by `orders:refund_approve`. (Migration `20260510020000`.)
- **`restore_stock_for_order(p_order_id, p_actor_id)` internal helper** — walks order_items × recipes, INSERTs positive stock_movements with `type='refund_restore'`. REVOKEd from `authenticated`; only callable from SECURITY DEFINER paths. (Migration `20260510020000`.)
- **`create_refund(p_payment_id, p_amount, p_reason)` RPC** — replaces direct INSERT in `refund-actions.ts`. Validates `payment.status='completed'` (the missing precondition), enforces `sum(pending+approved refunds) ≤ payment.amount`, writes audit row. (Migration `20260510030000`.)
- **`stock_movements.type` CHECK extended** to include `refund_restore` (additive).
- **`journal_entries.reference_type` CHECK extended** to include `refund` (additive). Prior values `transfer` and `production` also enumerated explicitly so the constraint matches all existing posting paths.

## [Unreleased] — m4-payments-fix foundation + D011 v2 no-wait pieces (2026-04-29)

### Added

- **`webhook_events` table** with `UNIQUE (provider, request_id)` for payment-webhook idempotency. RLS allows `finance:view` SELECT; INSERT only via service_role webhook handlers. (Branch `m4-payments-fix`.)
- **`refunds.approved_at TIMESTAMPTZ`** column populated by the upcoming `reverse_payment_and_post` RPC.
- **`payments.stock_consumed_status TEXT`** column (nullable until recompute migration adds CHECK) — replaces the boolean `stock_consumed` return signal with a queryable status enum (`ok | out_of_stock | recipe_missing | internal_error`).
- **Permission key `orders:refund_approve`** seeded into the `owner` and `super_manager` role templates. Distinct from existing `orders:refund` (creation); approval requires escalation.
- **`redactCredentials()` utility** (`packages/shared/src/utils/redact-credentials.ts`) — case-insensitive exact-key allowlist that strips secrets before they hit `audit_logs`. 11 unit tests.
- **`with-action.ts` `requireBranchScope` option** — branch_manager / cashier with null `branch_id` are rejected with `branch_scope_unset` instead of widening to tenant scope.
- **Test runner wired into turbo:** new `test` task + root `pnpm test` and `pnpm verify` aggregate.
- **D011 v2 ADR** (`docs/plan/decisions.md`) sequencing the provider-config + local-fallback layer AFTER m4-payments-fix lands. (Branch `d011-v2`.)
- **D011 v2 provider resolver** (`packages/shared/src/providers/config.ts`) and **LocalMisaProvider** (`packages/shared/src/providers/impl/misa-local.ts`) staged as pure logic. (Branch `d011-v2`.)
- **Provider QA runbook** at `docs/runbooks/finance/providers-pre-release-qa.md`.
- **7 new regression rules** capturing the m4 + D011 design contracts:
  - `AUDIT-NEVER-LOG-CREDENTIALS`
  - `WEBHOOK-MUST-IDEMPOTENT`
  - `WEBHOOK-MUST-BIND-TENANT`
  - `STOCK-CONSUME-MUST-CHECK-RESULT`
  - `PAYMENT-AMOUNT-MUST-RECOMPUTE-SERVER`
  - `REFUND-MUST-CHECK-PAYMENT-COMPLETED`
  - `REFUND-MUST-REVERSE-ATOMICALLY`

### Pending (next slice — WAITING owner apply migrations + `pnpm db:types`)

- `reverse_payment_and_post(p_refund_id)` atomic RPC + `restore_stock_for_order` helper (m4 P0-1)
- `create_refund` RPC with `payment.status='completed'` precondition + `area_manager` scope check (m4 P0-5)
- `payment_recompute_total` migration rewriting `confirm_cash_payment` + `complete_payment_and_consume_stock` to add server-side total recompute and `stock_consumed_status` enum return (m4 P0-3 + P0-4)
- `posting_rule_refund_approve` seed (m4 §3.6)
- TS callers: `apps/web/app/orders/refund-actions.ts`, `apps/web/app/api/webhooks/momo/route.ts`, `apps/web/app/br/[branchId]/pos/payment-actions.ts`
- D011 v2 PR-1+: `provider_configs` table, `confirm_manual_payment` wrapper RPC, admin UI

## [1.1.0.0] - 2026-04-15

### Added

- GL auto-posting engine: every business transaction now creates balanced journal entries automatically
- `posting_rules` table with 16 VAS-standard rules configurable per tenant
- `auto_post_journal()` core RPC called from all business-event RPCs
- POS cash/VietQR/Momo payments auto-post Revenue + COGS + VAT journals
- GRN confirmation auto-posts Inventory (Dr 152) / AP (Cr 331) journals
- Supplier payment tracking with `supplier_payments` table and AP reduction journals
- Payroll approval auto-posts multi-line journal (salary, BHXH/BHYT/BHTN, PIT)
- Stock transfer receive auto-posts inter-branch inventory reclassification
- Production order completion auto-posts raw material consumption + finished goods output
- Fiscal period management (open/closing/closed) with period enforcement
- Month-end close procedure with MV refresh and 5-category GL reconciliation
- Posting rules admin page at `/admin/finance/posting-rules`
- Fiscal periods page at `/admin/finance/periods` with close workflow and reconciliation dialog
- Badge "Tự động" on auto-posted journal entries
- Account 155 (Thành phẩm) added to VAS chart of accounts
- `confirm_payment_and_post()` atomic RPC replacing non-atomic VietQR/Momo confirmation
- Implicit subledger FK (`journal_entry_id`) on payments, GRN, invoices, payroll, transfers, production

### Changed

- `create_payment()` RPC now auto-posts GL journal on cash payment completion
- `confirm_goods_receipt_note()` RPC now auto-posts GL journal on GRN confirmation
- `stock_transfer_receive()` RPC now auto-posts GL journal on transfer receive
- `confirm_production_order()` RPC now auto-posts GL journal on production completion
- `confirmPayment` server action refactored from 3 non-atomic DB calls to atomic RPC
- `approvePayroll` server action now calls `post_payroll_journal` on approval

### Removed

- Inventory design mockup files (`inventory/trang_*/`) — implementations live in `apps/web/app/inventory/`
