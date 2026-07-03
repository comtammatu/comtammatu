# Receipt Item Table Simplification — 2026-07-03

> Reconciled-through 3af338ca

Goal: make customer-facing `receipt` and `provisional_bill` prints readable after the menu category split by keeping category groups without category header rows.

Done: default print templates and active template content keep `group_by_category`; renderer fallback tests prove food/drink section headers are not inserted, while `Tổng Đồ ăn` and `Tổng Nước uống` print after their category items. The item table uses open columns and raster rules instead of text box borders.

Non-goals: no payment/RPC math change, no print-agent change, no production apply by agents.

Safety: migration file only; production apply remains owner-gated per `docs/agent/rules/database.md`.

Skill plan: repo rules = engineering + skills + workflow + database + ui + team; external skills = none; runtime tools = CodeGraph + shell + pnpm; skipped = external subagents unavailable in this Codex session, written transcript fallback used.

## T3 Transcript

PM: Scope is a narrow print readability fix for two customer bills. Acceptance is category grouping without category header rows, still showing unit price, subtotal rows, adjustments, payment QR, and cash change where applicable.

BA: Category split is needed for owner/customer readability, but the category name should only appear in subtotal labels. Existing order-level totals remain the source for bill totals.

Data/DB: The live print path materializes `payload.document` in DB, so TS-only fallback would not fix production. Migration must update `print_template_default_content` and active `print_template_versions` content without applying to production.

QA/Print: Cover both fallback materialization and render output. Verify SQL baseline default mirrors TS defaults, no text box borders remain in receipt item rows, and keep print-agent unchanged because it only renders materialized documents.

## Synthesis

Agreements: keep the default `group_by_category` flag for `receipt` and `provisional_bill`, but interpret it as category subtotal rows only.

Conflict resolved: full section grouping made the bill busy. The simpler customer-facing contract is no section header, no per-item separator, and one subtotal row after each category block.

Unified contract: new receipts and provisional bills materialize `itemsTable` with `group_by_category: true`; active receipt/provisional templates set that flag; the renderer prints food items, `Tổng Đồ ăn`, drink items, then `Tổng Nước uống`; existing printed `payload.document` snapshots remain immutable.

Attestation: BA rule maps to `packages/print-render/src/template-content.ts`, `packages/print-render/src/document-render.ts`, `supabase/migrations/00000000000000_baseline.sql`, and `supabase/migrations/20260703143000_simplify_receipt_item_tables.sql`; tests cover the render contract in `packages/print-render/src/__tests__/materialize-render.test.ts`; no out-of-scope payment, schema, or print-agent behavior changed.
