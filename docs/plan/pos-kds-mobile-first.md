# POS/KDS Mobile-First Deep Dive

> Status: proposed
> Owners: PM + BA + Senior Dev + QA/QC debate synthesis
> Surfaces: `/br/[branchId]/pos`, `/br/[branchId]/kds`

## Why this exists

POS and KDS already cover the main operational workflow, but the UI currently spends too much space explaining status before exposing the next action. On mobile and tablet, that adds scroll, increases cognitive load, and slows frontline staff.

This plan locks a mobile-first, preset-first direction without creating a parallel design system.

## 4-agent synthesis

### Agreements

- POS and KDS are operational surfaces, not dashboards.
- The first viewport on mobile must prioritize the next action over hero copy, repeated progress blocks, or KPI cards.
- Current POS repeats workflow context across header, rail, table gate, and sidebar.
- Current KDS places analytics and summaries ahead of the live ticket board.
- `shadcn/ui` preset `radix-mira` must remain the only visual source of truth.
- The biggest product gain is layout compaction and workflow clarity, not a new theme.
- Table selection is necessary for dine-in, but it should shrink once the table is locked.
- Post-submit order changes must flow through order detail, not the new-order cart.
- Runtime docs must stop drifting from runtime reality, including font decisions.

### Conflicts and resolutions

- Conflict: whether to change the global font now.
  Resolution: keep runtime `Inter` for now and update docs to match runtime. Typography tuning is lower priority than workflow speed.

- Conflict: whether to remove analytics from POS/KDS.
  Resolution: keep analytics as secondary information, especially on desktop, but never let them block the first action zone on mobile.

- Conflict: whether to introduce shared operational wrappers in `packages/ui`.
  Resolution: keep any new wrappers route-local first. Promote to shared only after two surfaces need the same semantics, not just similar visuals.

## Unified task contract

### Scope

- Reduce duplicated workflow chrome in POS and KDS.
- Make POS and KDS mobile-first without inventing a new design language.
- Add explicit operational UI philosophy to `AGENTS.md`.
- Align docs with runtime where they currently drift.

Out of scope:

- Rebranding or redesigning the global design system.
- Replacing the root font just for aesthetics.
- Expanding the work into Admin, Inventory, or Employee routes.
- Adding a new theme layer, helper class system, or parallel primitive set.

### Business rules

- Cashier opens a session per terminal, manages billing, and closes orders.
- Waiter must lock the correct table before creating a dine-in order.
- "Append items to existing order" is the correct fix for follow-up requests; never create a second live order for the same table just to add items.
- The new-order cart is only for orders that have not been submitted yet.
- After submit, users should return to order detail/history for add-item, service, complete, transfer, or cancel flows.
- `ready` means kitchen-ready, not automatically served.
- KDS works by station and ticket urgency, not by dashboard metrics.

### Implementation plan

#### Phase 0: contract and doc alignment

- Update `AGENTS.md` with operational UI philosophy.
- Fix docs that drift from runtime, starting with the root font reference.
- Keep the preset-first contract explicit in UI docs.

#### Phase 1: POS simplification

- Shrink POS header into operational chrome only: terminal, opened-at, close session, current context.
- Remove repeated workflow narration from the header and left rail.
- Keep one primary coordination surface:
  - desktop: sidebar for new order vs active orders
  - mobile: drawer/bottom action entry
- Replace fake tab/radio/progress patterns with shadcn-backed primitives where applicable.
- Reduce table gate to context header plus zone/table grid.

#### Phase 2: KDS reorder

- Move station switching and filtering ahead of analytics on mobile.
- Make the ticket board the first live block.
- Keep summary and "hot order" insight as secondary content, especially on desktop.
- Put urgency on the `OrderCard` itself instead of duplicating the same order in multiple summary blocks.

#### Phase 3: primitive alignment

- Replace custom-styled fake controls that behave like `Tabs`, `Badge`, `Button`, or `Progress`.
- Remove static presentation patterns that drift from preset-backed composition.
- Keep new abstractions local to POS/KDS until reuse is proven.

#### Phase 4: polish and verification

- Verify touch targets, sticky context, scroll containers, and reduced-motion behavior.
- Run `pnpm typecheck && pnpm lint && pnpm build`.
- Validate with task-based checks, not screenshot review alone.

### Test plan

- POS flow A: open session, choose table, add 2 items, add note, submit order.
- POS flow B: switch dine-in/takeaway, reopen an active order, append items, verify order context survives refresh.
- KDS flow A: detect newest urgent order, bump one item, recall one item, complete a batch.
- KDS flow B: change station and status filters, receive realtime tickets, confirm no lost context after reload.
- Stress: 30-50 orders on KDS, 20+ items in POS cart.
- Error paths: no session, busy terminal, no tables, empty filters, RPC failure, realtime interruption.

### Acceptance criteria

- Staff can reach the primary POS or KDS action in the first viewport on mobile.
- POS no longer repeats the same workflow state across multiple chrome layers.
- KDS shows the live queue before analytics on mobile.
- Table selection becomes compact after context is locked.
- All critical controls remain preset-first and use real shadcn primitives where applicable.
- Docs and runtime no longer disagree on root font.

## Working heuristics

- First viewport = next safe action.
- One workflow state = one home.
- Context locked = chrome shrinks.
- Desktop adds density, not a second IA.
- Frontline copy must be task language, not abstract product language.
