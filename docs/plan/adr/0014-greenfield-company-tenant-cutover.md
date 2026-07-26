# ADR 0014 — Greenfield Company/Tenant cutover

**Status:** Accepted for implementation; cutover owner-gated

**Decision owner:** Owner, 2026-07-26

## Context

The deployed system is the current HKD `Tenant → Branch` product. The target is
the F&B ERP for Cơm Tấm Má Tư under Công ty Cổ Phần Chén Sứ:

```text
Company
├── Company-scoped office workforce
└── Tenant
    ├── Central Warehouse
    ├── Central Kitchen
    └── N operating Branches
```

The target must start on a fresh Supabase Project. Existing operational rows are
not migration input. Current-state specifications remain authoritative until
each target slice is deployed.

## Decision

- Create one fresh Supabase production candidate. It is not a DEV environment.
- Do not dual-write and do not copy orders, payments, stock, HR, invoice, audit,
  or auth rows from the current project.
- Seed only versioned reference data required by the application. Provision
  Company, Tenant, sites, users, master data, provider settings, and device
  identities explicitly on the candidate.
- Do not query or mutate the candidate until its exact ref and rights are added
  consistently to the Environment Registry, database guard, runtime adapters,
  and type-generation contract.
- Install only a target migration chain that passes from-empty replay. Do not
  call the current baseline a greenfield target merely because it contains no
  business rows.
- Keep one web deployment, one Supabase data platform, and the existing
  print-agent runtime. Company, Tenant, and operational site are authorization
  and workflow scopes, not services; warehouse, kitchen, and branch are site
  kinds.
- Keep existing durable HĐĐT and print job tables. Do not add a message broker
  or Supabase Queues without measured throughput or consumer-semantics evidence.
- Remove `service_role` from branch machines before cutover. Every print-agent
  receives a revocable, site-scoped identity.
- V1 activates one enterprise Viettel invoice profile. Prices are VAT-inclusive;
  each order line snapshots its VAT rate, while each invoice job snapshots the
  effective profile version, seller identity, template, and series.

## Cutover

1. Freeze target schema and configuration contracts.
2. Pass migration replay, SQL/RLS negative tests, Auth, Realtime, Storage,
   POS → payment → KDS, HĐĐT issue/reconcile, and physical print checks.
3. Select backup RPO/RTO and prove a restore.
4. Provision production secrets and scoped agent identities.
5. Enter a controlled write freeze. Disable old-project cron and webhook ingress,
   revoke old runtime and agent credentials, and prove that no old writer remains.
6. Switch Vercel and print-agent targets.
7. Admit the first live transaction only after the owner records the cutover
   approval.

Before the first accepted live transaction, rollback may switch Vercel and
agents back to the current project and explicitly reopen its authority under the
same write freeze. After that point, rollback to the old project is prohibited
because it would split payment, HĐĐT, stock, and audit authority. Recovery must
restore or fix forward on the new project.

The old project remains read-only for a bounded retention period. Revocation,
archive, or deletion is a separate owner decision after legal and operational
retention obligations are settled.

## Consequences

- No backfill, compatibility layer, legacy-ID mapping, or reconciliation
  between two active systems is required.
- Users, master data, integrations, and devices must be provisioned again.
- Historical reporting remains in the retained old project or authoritative
  external providers; it is not mixed into the new ERP.
- Current Auth, route, database, and infrastructure docs change only when their
  implementation slice becomes deployed truth.

## Verification

- Exact candidate ref is registered and every guard-sync fixture passes.
- The target chain replays from empty and generated types come from the verified
  candidate schema.
- Company office users work without a fake site; site workers fail closed
  outside assigned sites.
- Mixed-VAT gross-price fixtures reconcile to the collected amount and pass the
  approved Viettel account contract.
- Replacement and adjustment reuse the original locked line, VAT, seller,
  template, and series snapshots.
- Provider credentials never reach the browser; `service_role` never reaches a
  branch machine.
- Old cron, webhook ingress, runtime credentials, and agent credentials cannot
  write before the first live target transaction.
- Backup restore, candidate health, invoice reconciliation, physical print,
  canary rollout, and pre-live rollback are demonstrated before owner cutover.
