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

## Security Fixes (Priority)

- [ ] Login rate limiting — wire existing `loginRateLimit` from `@comtammatu/security` into login action
- [ ] Order item state machine RPC — `transition_order_item_status(item_id, new_status, expected_status)` with derived order status
- [ ] Revoke direct UPDATE on `order_items.status` and `orders.status` — all transitions via RPC only

## H3: area_manager Scoping

- [ ] Migration: `areas` + `area_branches` tables with RLS
- [ ] Migration: add `area_id` FK to `profiles` for area_manager
- [ ] Update JWT hook: inject `area_id` into claims
- [ ] Update `admin_update_profile` RPC: area_manager scope checks
- [ ] Update RLS policies: area_manager sees only area branches
- [ ] UI: area management page (owner/super_manager only)

## M3 KDS

- [ ] S1: KDS station config (kds_stations, kds_station_categories)
- [ ] S2: KDS UI — derive queue from order_items + station_categories (no kds_tickets table)
- [ ] S3: Bump/complete — uses transition_order_item_status RPC, Supabase Realtime on order_items

## Deferred to M4 (Payment)

- [ ] Server-side price rehydration in create_order RPC (CodeRabbit Critical #1+#2) — client-controlled pricing acceptable for internal MVP, must fix before payment integration
- [ ] Webhook signature verification — `/api/webhooks` is public in proxy.ts, each Momo/VietQR handler must verify HMAC signatures
- [ ] Rate limit monitoring alert — detect when Upstash is unreachable (fail-open becomes no protection)
