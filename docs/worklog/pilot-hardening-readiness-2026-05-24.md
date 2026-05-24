# Pilot Hardening Readiness - 2026-05-24

## Scope

This worklog tracks the hardening queue requested after the architecture and
schema review:

1. Close/split the App Router route-group migration.
2. Refresh generated snapshot docs.
3. Clarify P0 payment readiness.
4. Clarify network-gate hardening.
5. Define the real POS -> payment -> stock -> KDS/print -> HĐĐT smoke gate.
6. Normalize migration status language.

This is not a claim that external credentials, production DB migrations, or
live payment/HĐĐT smoke have been completed.

## 4-Perspective Contract

Documentation-only changes can skip the formal 4-agent implementation debate,
but this task crosses operational readiness. The practical synthesis for this
slice:

| Perspective | Decision                                                                                                                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PM          | Close what can be closed locally: route inventory evidence, generated counts, source-of-truth docs, and readiness board. Do not represent external credentials or production DB apply as complete. |
| BA          | Use the pilot operating path as the acceptance model: POS payment must end in durable order/payment/stock/print/HĐĐT state, not a UI-only success.                                                 |
| Senior Dev  | Keep Postgres/RPC as source of truth. Do not add new runtime code until route migration and apply-status evidence are stable.                                                                      |
| QA/QC       | Require static verification now; require live provider/DB smoke before production readiness.                                                                                                       |

## Current Generated Snapshot

Command:

```bash
node scripts/project-snapshot.mjs
```

Snapshot from current checkout:

| Area                              | Count |
| --------------------------------- | ----: |
| Worktree status entries           |   817 |
| `apps/web/app/**/page.tsx` routes |   109 |
| API route handlers                |    13 |
| Total route handlers              |    14 |
| Generated DB tables               |   115 |
| Generated DB views                |     9 |
| Generated DB functions            |   237 |
| Generated DB enums                |     0 |
| SQL migration files               |   347 |
| Test/spec files                   |    36 |
| Playwright specs                  |     9 |
| Shared unit test files            |    27 |

## Route-Group Migration Closure

Route moves staged:

| Probe                                       | Count |
| ------------------------------------------- | ----: |
| Staged app route moves                      |   470 |
| Staged `R100` route moves                   |   379 |
| Staged reviewed changed route moves         |    91 |
| Staged intentional cleanup/delete set       |    17 |

Current remaining route move probe:

| Probe                                        | Count |
| -------------------------------------------- | ----: |
| Tracked deleted files                        |    52 |
| Untracked route files                        |    60 |
| Deleted files with a route-group counterpart |    52 |
| Byte-identical counterparts                  |     0 |
| Counterparts with content changes            |    52 |
| Deleted files without counterpart            |     0 |

The 17 no-counterpart deletes were reviewed and staged as expected cleanup
classes:

- Legacy `docs/llm-wiki/*`.
- Legacy `matu-surface`.
- Legacy generated design-token package/files.
- Legacy `admin/kitchen-sink`.
- Replaced Inventory browser-draft helper.

Decision: do not stage the rest of the route-group migration as one blind block
until the 52 changed counterparts are reviewed. The remaining safe split is:

1. Review and stage changed counterparts by route family:
   branch/POS/KDS/settings (`52`).
2. Run `pnpm typecheck && pnpm lint && pnpm build` before marking route
   migration complete.

## Payment Readiness

Current local evidence:

| Item                                     | Status                                                       | Evidence / Next Step                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| MoMo provider runtime config             | local env present, production merchant capability not proven | Native QR still requires provider response field `qrCodeUrl`; do not encode `payUrl` or `deeplink` as QR.   |
| VietQR runtime config                    | not proven in local env                                      | Add real bank/API credentials or branch system settings before go-live.                                     |
| MoMo webhook idempotency                 | types generated                                              | `webhook_events` exists in generated types; verify applied production migration before go-live.             |
| Payment completion fail-hard + recompute | types generated                                              | `complete_payment_and_consume_stock` is in generated types; confirm prod apply status before relying on it. |
| Cash/VietQR confirmation RPCs            | types generated                                              | `confirm_cash_payment` and `confirm_vietqr_payment` are in generated types.                                 |
| Reconciliation                           | still required before go-live                                | Run ops reconciliation query/report for payment/order desync before enabling live MoMo/VietQR.              |

## Network Gate Readiness

Current status:

| Item                              | Status                               | Next Step                                                                                                                                                                           |
| --------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch trusted egress IP table    | types generated                      | Keep as proxy perimeter only; RLS/JWT remain source of truth.                                                                                                                       |
| Shared presence token             | code closed in dev/type-source Cloud | `PRINT_AGENT_PRESENCE_TOKEN` is now agent-local raw secret only; route accepts token hash through `register_branch_presence` and DB binds it to `(tenant_id, branch_id, agent_id)`. |
| `/api/branch-presence` rate limit | code closed in dev/type-source Cloud | `register_branch_presence` enforces durable 1 request / 30s per active token; same-IP fresh rows still return `skipped=true` without updating trust rows.                           |
| Soft revoke                       | code closed in dev/type-source Cloud | Agent heartbeat rejects revoked trusted IP rows and updates active rows with `revoked_at IS NULL`; admin re-enable remains explicit.                                                |

Operational rollout note: before live smoke, create one raw token per branch
agent through the repo-owned CLI, not by hand-editing the database:

```bash
pnpm --filter @comtammatu/print-agent presence:provision -- create \
  --tenant-id <tenant_id> \
  --branch-id <branch_id> \
  --agent-id pos-<branch-slug> \
  --confirm-project-ref <project-ref>
```

The command stores only the SHA-256 hash in `printer_agent_presence_tokens` and
prints the raw value once for that agent's `PRINT_AGENT_PRESENCE_TOKEN`.

## Live Smoke Gate

Production readiness requires one full happy-path and one failure-path smoke in
an approved dev/test or staging environment:

1. Open POS session.
2. Create order with stock-backed items.
3. Initiate payment:
   - Cash path: `confirm_cash_payment`.
   - VietQR path: pending -> cashier confirm via `confirm_vietqr_payment`.
   - MoMo path: native QR only when `qrCodeUrl` exists -> webhook -> `complete_payment_and_consume_stock`.
4. Verify order/payment status.
5. Verify stock consumption movements and no fail-soft completion.
6. Verify KDS ticket state and realtime/refetch.
7. Verify print job claim/complete path.
8. Issue HĐĐT through Viettel S-invoice or verify queued support workflow.
9. Run reconciliation query for payment/order/HĐĐT mismatch.

Do not mark this smoke complete from static tests alone.

## Migration Status Board

Use the repo migration vocabulary:

| Migration / Shape                                            | Local Status                                                     | Production Claim                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `webhook_events`                                             | types generated                                                  | not proven here                                                                 |
| `complete_payment_and_consume_stock` fail-hard/recompute     | types generated                                                  | not proven here                                                                 |
| `confirm_vietqr_payment`                                     | types generated                                                  | not proven here                                                                 |
| `branch_trusted_egress_ips` permission RLS                   | migration present / types generated                              | not proven here                                                                 |
| `printer_agent_presence_tokens` + `register_branch_presence` | applied to dev/type-source Cloud / types generated               | not production-applied; branch tokens still need provisioning before live smoke |
| Auth v3 live-role RPC batch                                  | migration present / generated functions visible where applicable | not proven here                                                                 |
| KDS complete tickets RPC                                     | types generated                                                  | not proven here                                                                 |

Next production-safe step: owner confirms which migrations are prod-applied; then
regenerate types from that target or record the exact prod migration list.
