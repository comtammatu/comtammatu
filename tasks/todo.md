# Current Tasks

> Active work items for the current session/phase.
> Update during work, clear completed items regularly.

## Pre-M2 Cleanup (Prep Session)

- [x] Migration: DROP old admin_update_profile 4-param overload
- [x] Migration: ADD tenant_id indexes (variants, modifiers, available_sides)
- [x] Sync database-schema.md (settings JSONB note, new indexes, overload note)
- [x] Update security.md (fail-open policy for Upstash)
- [ ] /verify passes

## Next: M2 POS — Point of Sale

- [ ] S1: Order schema + state machine (orders, order_items, order_status_history)
- [ ] S2: POS terminal + sessions (pos_terminals, pos_sessions)
- [ ] S3: Menu browse + cart UI
- [ ] S4: Table selection + order submit
- [ ] S5: Bill printing + cash register
