# Module Card — UI & Design System

## Current State

The design system is locked to the current shadcn preset and the app-wide matu-superapp baseline. Generated `matu-*` tokens and `font-matu-body` are available for token-level implementation and visual QA, while route code should prefer semantic token classes and canonical surface adapters. This is governed by the main design-system contract, not a separate custom theme layer.

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
- Use `apps/web/app/components/surface.tsx` for route surfaces; `matu-surface.tsx` is compatibility/showcase only.
- Use form helpers from `apps/web/app/components/form/*`.
- Use semantic tokens, not raw palette classes for status meaning.
- Prefer semantic classes; use generated `matu-*` token classes only for token QA or approved token-level implementation.
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

- `docs/spec/design-system.md`
- `docs/modules/ui.md`
- `docs/agent/rules/ui.md`
- `docs/plan/inventory-redesign-2026-05-08/shotgun-hom-nay.md` when touching the Inventory pilot

## What To Do Next

Before any UI runtime edit, state:

- surface and route family
- primary user job
- change type: visual, UX flow, copy, behavior
- primitives to use
- regression risks

Then implement narrowly and verify visually for non-trivial UI changes.
