# Current Tasks

> Active work items for the current session/phase.
> Update during work, clear completed items regularly.

## M3 KDS — Kitchen Display System ✅ SHIPPED

- [x] S1: KDS station config (kds_stations, kds_station_categories)
- [x] S2: Realtime order queue (kds_tickets, route_order_to_kds RPC)
- [x] S3: Bump/complete + recall (bump_kds_ticket, recall_kds_ticket, check_order_ready RPCs)
- [x] Security hardening: tenant/branch isolation on RPCs + RLS
- [x] Code review fixes: race condition (FOR UPDATE), is_active check, atomic save_station_categories, localization

## Deferred to M4 (Payment)

- [ ] Server-side price rehydration in create_order RPC — DONE in M3 (create_order now re-fetches prices server-side). Remaining: payment integration, VietQR, Momo.

## Deferred (area_manager scoping)

- [ ] H3: area_manager branch scope — create `areas` + `area_branches` mapping (see roadmap Sprint Hotfix section)

## Up Next: M4 Payment

- [ ] S1: Payment schema (payments table)
- [ ] S2: VietQR integration
- [ ] S3: Momo integration (payment_webhooks)
- [ ] S4: Refunds (refunds table)
- [ ] S5: End-of-day reconciliation
