# Current Tasks

> Active work items for the current session/phase.
> Update during work, clear completed items regularly.

## M2 POS — Point of Sale ✅ SHIPPED

- [x] S1: Order schema + state machine (orders, order_items, order_status_history)
- [x] S2: POS terminal + sessions (pos_terminals, pos_sessions)
- [x] S3: Menu browse + cart UI
- [x] S4: Table selection + order submit
- [x] S5: Bill printing + cash register

## Post-M2 Polish ✅

- [x] Settings ACL: area_manager + branch_manager can access /admin/settings/tables
- [x] Tables page: branch_manager sees only their branch data
- [x] Staff page: excludes owner/super_manager from list, manageable roles only
- [x] Staff form: tenant-level roles disable branch selector
- [x] extractClaims: fallback from user_role to role for app_metadata compatibility
- [x] Sidebar labels localized to Vietnamese
- [x] Swarm coordination docs expanded

## Deferred to M4 (Payment)

- [ ] Server-side price rehydration in create_order RPC (CodeRabbit Critical #1+#2) — client-controlled pricing acceptable for internal MVP, must fix before payment integration

## Deferred (area_manager scoping)

- [ ] H3: area_manager branch scope — create `areas` + `area_branches` mapping (see roadmap Sprint Hotfix section)

## Up Next: M3 KDS

- [ ] S1: KDS station config (kds_stations, kds_station_categories)
- [ ] S2: Realtime order queue (kds_tickets)
- [ ] S3: Bump/complete + alerts
