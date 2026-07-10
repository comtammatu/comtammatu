# Self-Order Seating Capability Rollout

This runbook rolls out seating-bound Self-Order through a table QR without
treating the stable printed QR as a bearer for an active bill. It is a release
procedure, not the source of truth for product or database semantics. The
contract lives in
`docs/spec/self-order-guest-ui.md` and the forward migrations named below.

## Status vocabulary

- **Written:** code and migrations exist locally.
- **Static-green:** focused tests, lint, typecheck, and build gates pass.
- **Runtime-verified:** migrations compile on the named non-production database
  and the multi-device scenarios below have recorded evidence.
- **Applied to production:** the named migrations and app release are present in
  the production environment.
- **Canary-enabled:** one named idle table has capability version `2` after an
  explicit owner-approved activation.

Never collapse these states into “done.” A migration file in git is not an
applied migration, and a deployed app does not enable version `2` by itself.

## Release contract

- Migrations are additive and tables default to capability version `1`.
- Version `1` remains available during deploy and rollback.
- The session-integrity and payment-integrity migrations, plus the order-transfer
  seating guard in the capability migration, change shared version `1` behavior
  for every Self-Order table. Only enabling capability version `2` is
  table-scoped.
- Version `2` reads and writes require an opaque seating-bound device cookie.
- The first device and every joined device require a staff-verified pairing code.
- Rejected and revoked devices remain denied for that seating. A new seating is
  the recovery boundary.
- One active payment request spans cash call and VietQR. Guests do not cancel it;
  staff owns cancellation and method switching.
- Payment completion keeps the existing POS finalizer behavior. This rollout
  does not redefine order completion, table release, KDS state, or inventory.

## Artifacts

Apply in repository order:

1. `20260710004403_self_order_session_integrity.sql`
2. `20260710011125_self_order_payment_intent_integrity.sql`
3. `20260710032028_self_order_seating_capability.sql`
4. `20260710032423_self_order_cash_invoice_binding.sql`

The app deployment must include the matching QR Route Handlers, staff queue,
guest workflow, service-worker policy, and public response schemas.

## Preconditions

- [ ] Record the environment name, Supabase project ref, app URL, commit SHA, and
      migration hashes.
- [ ] Verify the target against `docs/agent/rules/database.md`.
- [ ] Use non-production first. Production migration apply and canary activation
      each require explicit owner delegation in the current session.
- [ ] Configure `SELF_ORDER_DEVICE_PEPPER` as a stable secret of at least 32
      characters before deploying the app. Do not reuse it across environments
      or rotate it during an open seating.
- [ ] Confirm the branch has an open POS session, an enabled test table QR, a
      payable menu, VietQR test configuration, and staff with the required branch
      permissions.
- [ ] Prepare two independent mobile browsers and one staff POS browser.
- [ ] Confirm no pending or active Self-Order session exists on the canary table.

Read-only preflight query:

```sql
select
  t.id,
  t.branch_id,
  t.number,
  t.self_order_enabled,
  t.self_order_capability_version,
  exists (
    select 1
    from public.self_order_sessions s
    where s.tenant_id = t.tenant_id
      and s.table_id = t.id
      and s.status in ('pending_approval', 'active')
  ) as has_open_seating
from public.tables t
where t.id = :canary_table_id;
```

## Production-wide maintenance and data preflight

This gate is required immediately before any owner-delegated production apply.
It does not grant production-write authority. The explicit owner delegation in
the current session remains mandatory.

The chain backfills and constrains shared session, batch, payment, and
order-transfer paths used by every version `1` table. A clean canary table alone
is not enough:

1. Schedule a Self-Order maintenance window across every enabled table and stop
   accepting new QR rounds.
2. Let staff resolve every open seating and active cash/VietQR request through
   canonical POS actions. Do not delete or edit operational rows to manufacture
   a zero count.
3. Have the owner-designated operator hold the drain through the existing table
   settings so no new Self-Order session can start during migration and deploy.
4. Run the read-only query below in the target environment. Every `issue_count`
   must be `0`.
5. Re-run it immediately before the migration transaction. Any non-zero result
   is a stop condition and needs a separately reviewed fix-forward plan.

```sql
select 'open_sessions' as check_name, count(*)::bigint as issue_count
from public.self_order_sessions
where status in ('pending_approval', 'active')

union all

select 'active_payment_requests', count(*)::bigint
from public.self_order_payment_requests
where status in ('cash_call', 'vietqr_pending')

union all

select 'terminal_session_missing_closed_at', count(*)::bigint
from public.self_order_sessions
where status in ('closed', 'revoked')
  and closed_at is null

union all

select 'active_session_incomplete', count(*)::bigint
from public.self_order_sessions
where status = 'active'
  and (order_id is null or approved_by is null or approved_at is null)

union all

select 'pending_session_prebound', count(*)::bigint
from public.self_order_sessions
where status = 'pending_approval'
  and (order_id is not null or approved_by is not null or approved_at is not null)

union all

select 'accepted_batch_incomplete', count(*)::bigint
from public.self_order_batches
where status in ('accepted', 'auto_accepted')
  and (order_id is null or accepted_by is null or accepted_at is null)

union all

select 'rejected_batch_incomplete', count(*)::bigint
from public.self_order_batches
where status = 'rejected'
  and (rejected_by is null or rejected_at is null)

union all

select 'duplicate_session_order_groups', count(*)::bigint
from (
  select tenant_id, order_id
  from public.self_order_sessions
  where order_id is not null
  group by tenant_id, order_id
  having count(*) > 1
) duplicate_session_orders

union all

select 'duplicate_active_payment_groups', count(*)::bigint
from (
  select tenant_id, session_id
  from public.self_order_payment_requests
  where status in ('cash_call', 'vietqr_pending')
  group by tenant_id, session_id
  having count(*) > 1
) duplicate_active_payments

union all

select 'duplicate_payment_binding_groups', count(*)::bigint
from (
  select tenant_id, payment_id
  from public.self_order_payment_requests
  where payment_id is not null
  group by tenant_id, payment_id
  having count(*) > 1
) duplicate_payment_bindings

union all

select 'session_order_orphans', count(*)::bigint
from public.self_order_sessions s
left join public.orders o
  on o.tenant_id = s.tenant_id
 and o.id = s.order_id
where s.order_id is not null
  and o.id is null

union all

select 'batch_order_orphans', count(*)::bigint
from public.self_order_batches b
left join public.orders o
  on o.tenant_id = b.tenant_id
 and o.id = b.order_id
where b.order_id is not null
  and o.id is null

union all

select 'vietqr_request_missing_payment_code', count(*)::bigint
from public.self_order_payment_requests pr
join public.orders o
  on o.tenant_id = pr.tenant_id
 and o.id = pr.order_id
where pr.method = 'vietqr'
  and nullif(btrim(o.payment_code), '') is null

order by check_name;
```

After the database chain and matching app release are present, prove the version
`1` compatibility flow on one controlled table before restoring Self-Order on
the remaining version `1` tables. Only then proceed to the version `2` canary.

## Non-production migration gate

1. Apply the migration chain to a disposable local or managed preview database.
2. Regenerate database types against that same schema with
   `corepack pnpm db:types`.
3. Run `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`.
4. Prove that a version `1` table still completes its existing guest and staff
   flow before enabling any table.
5. Record the exact migration versions and gate output.

Stop if the database cannot compile every function and trigger. Static SQL tests
are supporting evidence only; they do not satisfy this gate.

## Canary activation

Activation is table-scoped and must use the guarded RPC. Never update
`tables.self_order_capability_version` directly.

From an already authenticated owner/manager release session with
`settings:branch`, call:

```ts
await supabase.rpc("set_table_self_order_capability_version", {
  p_table_id: canaryTableId,
  p_version: 2,
});
```

The RPC must fail if the table has an open seating. Re-run the read-only preflight
and confirm only the selected table reports version `2`.

## Required multi-device smoke

Record IDs, timestamps, screenshots, and relevant safe logs for every scenario.

### First device and lost-response recovery

- [ ] Device A scans the printed QR, builds a customized cart, and submits once.
- [ ] The guest sees a pairing code; staff sees the same pending batch without
      buyer PII or capability secrets.
- [ ] Simulate an ambiguous/lost response and retry the exact operation. Confirm
      one session, one batch, and one canonical target order only.
- [ ] Retry the same operation ID with a changed payload. Confirm a safe conflict
      and no extra batch.
- [ ] Let the pairing code expire, refresh it, and confirm the pending device,
      batch, and draft are not terminalized.
- [ ] Staff approves with the current code. Confirm Device A receives the bill,
      the random seating realtime topic, and add-more access.

### Second device boundary

- [ ] Device B scans during the active seating. Confirm menu context is visible
      but bill, payment, and active-order data are hidden.
- [ ] Exercise join-only and join-with-cart paths. Each must require its own
      staff-visible pairing code and must not auto-approve because both devices
      share a branch Wi-Fi address.
- [ ] Approve Device B and confirm it sees the same canonical order and total.
- [ ] Revoke Device B. Confirm polling does not mint a new capability, join and
      submit CTAs remain blocked, and Device A remains unaffected.

### Ordering and operator truth

- [ ] Submit two near-concurrent add-more operations. Confirm idempotent recovery,
      immutable session-to-order binding, and no duplicate canonical lines.
- [ ] Reject one selected-device pending round. Confirm sibling rounds and an
      approved origin session are not incorrectly revoked.
- [ ] Confirm the guest bill shows canonical order lines and total first; round
      history is secondary and cannot redefine the payable amount.
- [ ] Confirm staff queue age, target order, pairing state, payment state, and
      approved-device controls recover after reload and realtime interruption.
- [ ] Transfer the canonical order to another table. Confirm the old seating is
      terminalized, every old-table device loses bill/payment access, and the
      destination table requires a fresh seating/device approval instead of
      inheriting the old capability.

### Payment and HĐĐT

- [ ] Before the order is eligible, VietQR fails safely while cash call remains
      available under the locked operating policy.
- [ ] Create a VietQR request, reload both browsers, and confirm the exact amount,
      bank destination, payment code, QR payload, and expiry recover unchanged.
- [ ] Confirm a simultaneous cash call cannot create a second active intent.
- [ ] Staff cancels the unpaid request, then exercises the alternate method.
- [ ] Complete payment and confirm the canonical payment/finalizer path owns
      order close and table release, while the payment-bound post-payment path
      owns receipt and HĐĐT handling.
- [ ] Confirm persisted buyer invoice data binds to the exact successful payment
      and never appears in guest snapshots, staff queues, or logs.
- [ ] Create two sequential same-amount VietQR intents with different buyer
      payloads, then deliver a late transfer for the first intent. Confirm the
      payment is reconciled once, automatic HĐĐT attribution fails closed to
      manual review, and no invoice is issued with the newer buyer identity.

### Next-seating privacy

- [ ] Finish or reject the seating through the staff flow.
- [ ] Reopen the printed QR from both old browsers. Confirm no prior bill or
      realtime topic is exposed.
- [ ] Start a new seating and confirm old rejected/revoked decisions do not bind
      the new session.
- [ ] With an approved bill visible, navigate away from `/q/[token]`, complete
      the seating, start the next seating, and use browser Back. Confirm a
      back/forward-cache restore never renders the old bill, payment details,
      buyer fields, cart, or realtime topic, even briefly.
- [ ] Repeat the Back flow while offline. The page must fail closed with an
      unavailable/retry state instead of restoring seating data. Return online,
      refresh, and confirm recovery does not submit or duplicate a batch.
- [ ] Confirm the new service worker is active, the old `pages` cache is
      absent, and an offline navigation to the printed QR cannot serve prior
      Self-Order HTML.
- [ ] Record the browser/version, whether `pageshow.persisted` was observed, the
      active service-worker version, cache inspection, screenshots, and safe
      network/console evidence for the online and offline runs.

## Rollback

If integrity or privacy is uncertain:

1. Disable Self-Order on the pilot table through the existing table setting. Do
   not delete sessions, batches, device rows, payment requests, or orders.
2. Let staff resolve any open payment request and close/reject the current
   seating using canonical staff actions.
3. After the table has no pending/active seating, call the guarded RPC with
   `p_version: 1` from an authenticated authorized release session.
4. Re-enable the table QR only after the version `1` smoke passes.
5. Preserve all rows and evidence for reconciliation and root-cause review.

Capability rollback does not remove the additive schema. It only returns the
selected table to the version `1` application path. It does not undo
`20260710004403_self_order_session_integrity.sql`,
`20260710011125_self_order_payment_intent_integrity.sql`, or the cash/HĐĐT
binding; those global integrity and payment behaviors remain active for every
version `1` table. The order-transfer seating guard also remains active.

If the failure is in a global session or payment path, pilot-only rollback is
insufficient. Keep Self-Order disabled on all affected tables, preserve the
rows, and stop for an owner-approved forward repair. Do not down-migrate or
delete operational evidence during incident recovery.

## Evidence record

```md
## Self-Order Seating Capability Evidence

- Date/time:
- Environment and project ref:
- App URL and commit SHA:
- Migration versions and SHA-256 hashes:
- Branch and canary table ID:
- Devices/browsers/network:
- Session, batch, order, and payment IDs:
- Version 1 compatibility: GREEN / RED
- First-device recovery: GREEN / RED
- Second-device boundary: GREEN / RED
- Payment and HĐĐT: GREEN / RED
- Next-seating privacy: GREEN / RED
- Offline/SW/BFCache privacy: GREEN / RED
- Production-wide drain and data preflight: GREEN / RED
- Rollback rehearsal: GREEN / RED
- Overall: GREEN / YELLOW / RED
- Blockers and owner decision:
```

The canary is green only when all required runtime scenarios pass and the full
repository gates are green on the deploy checkout. Otherwise keep all tables on
version `1`.
