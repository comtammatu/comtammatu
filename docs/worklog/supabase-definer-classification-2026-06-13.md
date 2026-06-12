# Supabase Definer Classification - 2026-06-13

Scope: production project `iexwsuaqqenyjiskawoj`, read-only Wave 4
classification after the Wave 3 internal-helper revoke was applied.

Skill plan: repo rules = engineering + database + skills + workflow;
external skills = supabase + supabase-postgres-best-practices; runtime tools =
Supabase MCP read-only catalog queries + local source scan; skipped = production
mutation, because this wave is classification only.

## T3 Synthesis

PM:

- Goal is to turn the remaining advisor backlog into an actionable queue, not to
  chase the warning count blindly.
- Acceptance for this wave is a clear split between active RPC surface,
  do-not-touch helpers, and owner-gated candidates.
- No production grant change should happen without a smaller per-domain contract.

BA:

- The remaining functions include real operator jobs: POS/KDS, payments,
  invoices, finance reports, procurement, inventory, HR, and staff management.
- Absence of a monorepo caller is not proof of dead code; external clients,
  print agents, service routes, or manual owner workflows may still depend on an
  RPC.
- Money/HĐĐT/refund/journal, auth/ACL, order state, and procurement functions
  need explicit owner sign-off before any revoke.

Senior Dev:

- Use exact source search plus production catalog, not broad advisor output.
- Separate direct browser/source RPCs from no-source candidates, then run the
  six-channel check before any future revoke migration.
- Default-privileges hardening should wait until every current RPC migration
  pattern has explicit `GRANT EXECUTE` statements.

QA/QC:

- Catalog baseline after Wave 3: `authenticated=161`, `anon=0`,
  `service_role=222` public SECURITY DEFINER functions.
- Source scan checked `apps/` and `packages/`, excluding generated database
  types.
- A revoke candidate still needs smoke coverage for the owning surface or a
  documented owner decision that the flow is retired.

## Evidence

Production catalog bucketed the remaining 161 authenticated-callable public
SECURITY DEFINER functions as:

| Bucket | Count | Notes |
| --- | ---: | --- |
| POS/KDS/print/order/menu | 49 | Many are direct app RPCs or intentional operator actions. |
| Money/tax/finance | 38 | High-risk: payments, refunds, HĐĐT, journal, revenue, finance dashboards. |
| Inventory/procurement | 37 | High-risk: stock, GRN, supplier returns, production, stocktake. |
| HR/admin/staff | 15 | Staff profile, permission, leave, notification, self-service flows. |
| Manual classification | 15 | Mixed zone locks, setup/admin, chart seed, feature toggles. |
| Auth/RLS/ACL helpers | 7 | Do not treat as simple advisor noise. |

The exact source scan narrowed the "no app/source hit and no DB reference" set
to 23 functions. This is a review queue, not an auto-revoke list.

## Candidate Queue

| Group | Functions | Recommendation |
| --- | --- | --- |
| Auth/display helpers | `current_position`, `has_position` | Do not revoke in a generic advisor wave. Review with auth/RLS compatibility and external-client assumptions. |
| POS/order/KDS legacy | `bump_kds_ticket`, `transition_order_item_status`, `transition_order_status` | Owner-gated. These are order state primitives; revoke only if confirmed retired and no external client exists. |
| Stock/payment helper | `consume_stock_for_order_service` | Owner-gated. Even with POS stock consumption currently disabled, this touches stock and payment history assumptions. |
| Money/AP/refund/payroll | `apply_credit_note_to_invoice`, `create_refund`, `create_supplier_payment`, `post_payroll_journal` | Owner-gated T3. These mutate regulated finance state. |
| Inventory/procurement controls | `assign_auditor`, `configure_express_window`, `extend_express_window`, `get_grn_price_baseline`, `override_grn_hardblock`, `resolve_po_prices_batch`, `try_auto_approve_grn`, `enable_offline_for_session` | Owner-gated. Split into stocktake, GRN pricing, GRN override, and offline-stocktake sub-waves. |
| Branch override/admin/self-service | `rotate_branch_override_code`, `set_branch_kind`, `verify_branch_override_code`, `update_my_dependents_count`, `update_my_profile` | Owner-gated. Branch override and profile/self-service workflows may be dormant but are user-facing/security-sensitive. |

Functions with source hits stay out of revoke waves unless the owning surface is
explicitly retired. Examples include POS print helpers, daily-limit helpers,
finance statement/dashboard RPCs, journal actions, replacement invoice flow,
supplier-return actions, and leave-request actions.

## Next Safe Work

1. Build an explicit `authenticated` RPC allowlist contract from the current
   runtime surface. The greenfield allowlist is useful prior art, but it is not
   current enough to apply mechanically.
2. Pick one no-source owner-gated group for Wave 4a. Recommended first group:
   auth/display helpers plus branch override/profile self-service, because the
   owner can answer usage quickly and the blast radius is smaller than money or
   inventory stock.
3. For the selected group, run the full six-channel scan again: source callers,
   internal SQL calls, triggers, RLS policies, DEFAULT/CHECK, and cron. Add
   external-client/owner sign-off as the seventh gate.
4. Only after sign-off, write a grant-only migration and apply separately.

## Not Done

- No production migration was applied in Wave 4.
- No advisor count reduction is expected from this classification note.
- No claim is made that the 23 candidates are dead; they are candidates for
  owner review.
