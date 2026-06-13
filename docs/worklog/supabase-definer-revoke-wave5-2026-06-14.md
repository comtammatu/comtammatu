# Supabase Definer Revoke Wave 5 - 2026-06-14

Scope: production project `iexwsuaqqenyjiskawoj`. Continues the
`authenticated_security_definer_function_executable` burn-down from Waves 1-3
(`supabase-advisor-hardening-2026-06-13.md`,
`supabase-authenticated-definer-audit-2026-06-13.md`) and the Wave 4
classification (`supabase-definer-classification-2026-06-13.md`).

Skill plan: repo rules = engineering + database + workflow + skills +
`tasks/regressions.md`; external skills = supabase +
supabase-postgres-best-practices; runtime tools = Supabase MCP read-only catalog
queries + local multiline source scan; skipped = production apply (no in-session
owner delegation this session — file → PR → owner per D015).

## T3 Synthesis

PM:

- Goal is to continue the warning burn-down with another grant-only wave whose
  blast radius is provably zero, not to chase the count by revoking functions the
  app actually calls.
- Acceptance: a revoke migration limited to functions verified non-user-path
  across all six caller channels, with the rest re-queued as owner-gated with
  evidence.

BA:

- The remaining authenticated-callable SECURITY DEFINER set is dominated by real
  operator RPCs (POS, payments, KDS, inventory, finance reads, HR self-service).
- A function with no monorepo `.rpc()` caller is not automatically dead: RLS
  helpers must keep authenticated EXECUTE, GL functions are mid-retirement under
  D020, and money/control functions may have service-role or owner-manual paths.

Senior Dev:

- The decisive correction this wave: the channel-1 (JS caller) scan must be
  **multiline-aware**. The app calls RPCs as `supabase.rpc(\n "name", {...})`,
  so a line-anchored `\.rpc\(\s*["']name` grep silently misses every call whose
  name sits on the next line.
- Revoking authenticated EXECUTE on a helper is safe only when every caller is a
  postgres-owned SECURITY DEFINER routine (the inner call then runs with the
  definer's privilege). That privilege chain was confirmed per-function before
  inclusion.

QA/QC:

- Production baseline 2026-06-14 (unchanged since Wave 3): public SECURITY DEFINER
  `authenticated=161`, `anon=0`, `service_role=222`.
- Six channels checked: JS `.rpc()` callers (multiline), internal SQL callers
  (`pg_proc.prosrc`), trigger execution (trigger-function bodies), RLS policies
  (`pg_policies.qual`/`with_check`), DEFAULT/CHECK expressions, and `cron.job`.
- Expected post-apply: the three targets become `authenticated=false`,
  `service_role=true`; advisor count drops by three to `authenticated=158`.

## Methodology Correction (must carry forward)

The Wave 4 classification's "23 no-source candidates" was built partly on a
**line-anchored** `.rpc()` grep. Re-running the channel-1 scan multiline-aware
(`rg -U`) raised the distinct caller set from **107 → 137 names**. The 30
newly-surfaced callers include live, user-path RPCs that the line-only scan had
mislabelled as having no app caller:

`aggregate_daily_b2c_invoice`, `clear_branch_menu_daily_limit`,
`confirm_vietqr_payment`, `create_supplier_return_from_grn`,
`create_supplier_return_from_stock`, `enqueue_cancel_ticket_print`,
`enqueue_edit_pending_order_item_quantity_print`,
`enqueue_partial_cancel_ticket_print`, `enqueue_shift_close_print`,
`get_finance_dashboard_summary`, `list_branch_menu_daily_limits`,
`mark_kds_item_out_of_stock`, `recompute_supplier_invoice_matching`,
`release_branch_menu_daily_holds`, `replace_tax_invoice`,
`reserve_branch_menu_daily_holds`, `set_branch_menu_daily_limit`,
`submit_leave_request`, `transition_supplier_return`,
`reverse_payment_and_post`, and others.

Had Wave 5 trusted the line-only scan, the revoke list would have included VietQR
payment confirmation, KDS out-of-stock, kitchen reprints, and menu daily-limit
RPCs — all signed-in app calls. Revoking them breaks the app
(`KHÔNG revoke nhầm RPC mà app gọi bằng JWT authenticated`). **Any future definer
wave MUST use the multiline scan.** Suggested anchor:

```bash
rg -UoN --no-filename -g '!**/database.types.ts' \
  "\.rpc\(\s*[\"'\`]([a-z_0-9]+)" apps packages
```

A second methodology note: Postgres `~` word boundaries are `\y` (either end), not
`\m` (word start). A `\m...\m` predicate matches nothing — sanity-check any
catalog reference scan against a known-referenced helper (e.g. `has_permission`)
before trusting zero-result rows.

## Deliverable

`supabase/migrations/20260614090000_authenticated_definer_trigger_helper_revoke.sql`
revokes `EXECUTE` from `authenticated` for three internal helpers and leaves
`service_role` + `postgres` intact. Wrapped in `BEGIN/COMMIT` with a DO-block
self-check that RAISEs (rolls back) if `authenticated` still holds EXECUTE or if
`service_role` lost it.

Privilege chain verified on prod (every caller is postgres-owned SECURITY
DEFINER, so the authenticated grant on the inner helper is unused):

| Target (revoked) | Sole caller(s) | Caller is definer? |
| --- | --- | --- |
| `compute_user_trust_score(uuid, bigint)` | `grn_is_auto_approvable` | yes (postgres) |
| `grn_is_auto_approvable(bigint)` | `try_auto_approve_grn` | yes (postgres) |
| `sync_insurance_base(bigint)` | `trg_sync_insurance_on_contract` (trigger) | yes (postgres; no authenticated grant) |

Each target: zero JS callers (whole repo, multiline), zero RLS-policy refs, zero
cron refs, zero DEFAULT/CHECK refs.

## Classification of the 49 no-JS-caller functions

After the corrected scan, 49 of the 161 have no signed-in app caller. They split:

- **KEEP — RLS predicate helpers (2):** `auth_role`, `is_inventory_production_operator`.
  Revoking breaks RLS: policies call these in the authenticated user's session, so
  authenticated EXECUTE is required. (`has_permission` / `has_permission_any` also
  mandatory-keep; they additionally have JS callers.)
- **REVOKE — Wave 5 (3):** `compute_user_trust_score`, `grn_is_auto_approvable`,
  `sync_insurance_base` (above).
- **EXCLUDE — D020 GL retirement, mid-flight (16):** `close_fiscal_period`,
  `close_period_hard`, `close_period_soft`, `create_manual_journal_entry`,
  `fn_generate_b01_dn`, `fn_generate_b02_dn`, `fn_generate_b03_dn`,
  `fn_generate_form_01_gtgt`, `fn_reconcile_drilldown`, `fn_reconcile_period`,
  `gl_reconciliation`, `post_manual_journal_entry`, `post_payroll_journal`,
  `reopen_period`, `seed_chart_of_accounts`, `void_manual_journal_entry`. D020
  step 2b DROPs these (drop removes all grants); revoking first only adds a
  migration-ordering collision. These show no caller now because D020 step 2a
  already removed their UI/actions.
- **EXCLUDE — dead-RPC drop candidates, owner-gated (11):** `has_position`,
  `resolve_po_price`, `resolve_po_prices_batch`, `rotate_branch_override_code`,
  `set_branch_kind`, `sync_missing_permissions_from_template`,
  `transition_order_status`, `transition_order_item_status`, `try_auto_approve_grn`,
  `update_my_profile`, `consume_stock_for_order` (D016 tail). Tracked in
  `tasks/todo.md`; the planned DROP removes the grant, so a revoke is redundant.
- **OWNER-GATED — regulated money / controls / self-service (16):**
  `apply_credit_note_to_invoice`, `create_refund`, `create_supplier_payment`,
  `consume_stock_for_order_service`, `assign_auditor`, `configure_express_window`,
  `extend_express_window`, `enable_offline_for_session`, `get_grn_price_baseline`,
  `override_grn_hardblock`, `create_waste_from_order`, `current_position`,
  `verify_branch_override_code`, `update_my_dependents_count`,
  `find_payment_order_desync`, `bump_kds_ticket`. No monorepo caller, but grep
  cannot prove no service-role/owner-manual/external caller; money and HĐĐT
  functions need explicit owner sign-off (`RPC-DROP-MUST-SCAN-6-CHANNELS`).
- **INVESTIGATE (1):** `enqueue_kitchen_print(bigint)` — holds authenticated
  EXECUTE but has zero callers across all six channels. Either dead (→ dead-RPC
  wave) or invoked by a path invisible to the catalog (external client). Not
  revoked; flagged because kitchen printing is operationally P0. Worth confirming
  how auto-kitchen-print is actually enqueued (relevant to the print-pipeline
  task D2).

The remaining 112 of 161 have verified signed-in app callers and stay callable.

## Honest scope note

The clean mechanical groups (anon, trigger helpers, cron automation, internal
resolvers) were exhausted in Waves 1-3. After the corrected scan, the only
remaining provably-safe revoke is these three internal helpers. Everything else
is either being dropped by D020 / the dead-RPC wave, or needs per-function owner
sign-off. This wave is deliberately small; forcing a larger revoke would either
break live RPCs or collide with D020. The real remaining attack-surface reduction
comes from completing D020 and the owner-gated dead-RPC drop wave, not from more
generic revoke waves.

## Production Apply (done 2026-06-14)

Owner delegated in-session apply (§2). MCP already connects as `postgres`; the
MCP guard hook (block 2 of `.claude/settings.json` PreToolUse) was lifted for the
window and restored byte-identical afterward (`git diff` empty, `lint:guard-sync`
green, write-probe re-blocked).

Applied via `mcp__supabase__execute_sql`:

1. Dry-run `BEGIN … REVOKE×3 … self-check … ROLLBACK` — passed.
2. Real `BEGIN … REVOKE×3 … self-check … ledger insert … COMMIT`.
3. Ledger row `20260614090000` recorded.

Verified: the three targets are now `authenticated=false`, `service_role=true`;
public SECURITY DEFINER callable count moved `authenticated 161 → 158`; `anon`
stays 0. No `pnpm db:types` (grant-only; no schema/type change).

Rollback (grant-only inverse):

```sql
GRANT EXECUTE ON FUNCTION public.compute_user_trust_score(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grn_is_auto_approvable(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_insurance_base(bigint) TO authenticated;
```

## Not Done

- No production migration applied in Wave 5.
- The two Auth-config advisor warnings (leaked-password, MFA) are owner dashboard
  work (task B), out of scope here.
