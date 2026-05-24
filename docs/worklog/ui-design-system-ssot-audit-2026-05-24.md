# UI Design System SSOT Audit - 2026-05-24

## Scope

Audit requested for interface, visual language, typography, spacing, and agent
source-of-truth drift.

This audit did not redesign the UI or migrate runtime surfaces. It locked the
authority contract so future UI work has one reference path.

## Verdict

CONDITIONAL GO for new UI work after this patch:

- Use `docs/spec/design-system.md` as the single Design System contract.
- Use runtime files only to verify implementation: `apps/web/components.json`,
  `packages/ui/components.json`, `packages/ui/src/styles/globals.css`,
  `apps/web/app/layout.tsx`, and `packages/ui/src/components/*`.
- Treat `matu-*` and `matu-surface` usage as legacy Inventory pilot migration
  work, not as permission to build another UI layer.

NO-GO for starting new UI from:

- `packages/design-tokens/tokens.json`
- `packages/ui/src/styles/matu-tokens.css`
- `apps/web/app/components/matu-surface.tsx`
- `apps/web/app/(protected)/admin/kitchen-sink/page.tsx`
- external `~/Downloads/matu-superapp/DESIGN.md`
- archived rebuild plans under `docs/archive/`

## Findings

1. `docs/spec/design-system.md` already described the intended system, but its
   old authority order put runtime files above the contract. That let agents
   over-trust leftover runtime comments.

2. A parallel Inventory pilot layer still existed: `packages/design-tokens`,
   generated `matu-tokens.css`, `font-matu-body`, `matu-surface`, and
   `/admin/kitchen-sink`. Some metadata described this layer as "single source
   of truth" or "before shipping UI", which directly conflicted with the active
   shadcn/Ma Tu Concept 01 contract.

3. Typography had the clearest collision. Active contract is Inter body,
   Montserrat headings, JetBrains Mono operational data. Runtime still exposes
   a Be Vietnam Pro hook for the legacy pilot surface. That hook is now marked
   legacy and blocked for new UI.

4. Spacing and radius were also split. Active rhythm allows app spacing/gap and
   radius through the locked rhythm contract and primitives. The legacy pilot
   tokens expose `--spacing-matu-*` and `--radius-matu-*`, which must not drive
   new work.

5. Component authority was split by `apps/web/app/components/surface.tsx` versus
   `apps/web/app/components/matu-surface.tsx`. The canonical adapter layer is
   now explicitly `surface.tsx`; `matu-surface.tsx` is legacy audit/migration
   material.

## Locked Agent Path

Before UI implementation:

1. Read `AGENTS.md`, `docs/agent/rules/ui.md`, `docs/spec/design-system.md`,
   `docs/modules/ui.md`, and `tasks/regressions.md`.
2. State the surface, primary user job, route family, change type, and shadcn
   primitives.
3. Search touched files for `matu-surface`, `font-matu-body`, `bg-matu-`,
   `text-matu-`, `border-matu-`, `rounded-matu`, `spacing-matu`, and
   `radius-matu`.
4. If any match is in the touched production surface, classify the task as a
   legacy pilot migration and move it to `surface.tsx` plus semantic tokens.
5. Do not copy from external DS folders or archived plans unless the task is
   explicitly to reactivate or replace the Design System.

## Follow-Up Cleanup

Recommended next slice, not done in this audit:

- Migrate or remove `/admin/kitchen-sink`.
- Remove `matu-surface` after no route imports it.
- Remove Be Vietnam Pro from `apps/web/app/layout.tsx` after `font-matu-body`
  has no runtime consumers.
- Remove `packages/design-tokens` and generated `matu-tokens.css`, or keep them
  only under an archived reference path.
- Add an automated lint/static check for new `matu-*` usage outside an explicit
  allowlist.
