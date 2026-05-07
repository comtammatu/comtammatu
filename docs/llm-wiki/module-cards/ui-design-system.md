# Module Card — UI & Design System

## Current State

The design system is locked to the current shadcn preset and Ma Tu Concept 01 tokens. It is not a separate custom theme layer.

Runtime authority:

- `apps/web/components.json`
- `packages/ui/components.json`
- `packages/ui/src/styles/globals.css`
- `apps/web/app/layout.tsx`
- `docs/spec/design-system.md`
- `docs/modules/ui.md`

## Core Rules

- Use shadcn/Radix primitives from `packages/ui/src/components/*`.
- Use `apps/web/app/components/surface.tsx` for app-level page/header/section/toolbar/empty/link-card patterns.
- Use form helpers from `apps/web/app/components/form/*`.
- Use semantic tokens, not raw palette classes for status meaning.
- Do not add arbitrary Tailwind dimensions.
- Do not add route-specific themes or `theme.css`.
- Do not fake primitives with raw `div`/`span`/`p`.
- Do not put agent/dev notes into UI copy.

## Surface Theses

- POS and KDS are frontline tools; first viewport shows the next safe action or live queue.
- Admin surfaces are dense management workspaces; prefer table/filter/form/review states.
- Inventory is workflow-first; tasks and exceptions beat decorative analytics.
- Employee surfaces are lightweight, narrow, and task-led.

## Current Rebuild Direction

The Super App/Merchant Platform rebuild should produce one coherent product feel through route ownership, navigation, shell consistency, and vocabulary. It should not create a new shell per role or a new `/merchant/*` route tree.

Read:

- `docs/plan/super-app-merchant-platform-rebuild.md`
- `docs/plan/ui-ux-rebuild.md`
- `docs/plan/ui-ux-page-contracts.md`

## What To Do Next

Before any UI runtime edit, state:

- surface and route family
- primary user job
- change type: visual, UX flow, copy, behavior
- primitives to use
- regression risks

Then implement narrowly and verify visually for non-trivial UI changes.
