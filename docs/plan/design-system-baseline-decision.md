# Baseline Decision Brief — Má Tư Design System

> Checkpoint: C0
> Scope: source/docs/static gates in worktree `codex/design-system-rollout`
> Decision: keep the current foundation, tune evidenced debt, and do not rebuild a competing Design System.

## 1. Conclusion

The current baseline has the correct authority and layering:

```text
Base UI behavior
→ @comtammatu/ui styled primitives
→ app/workflow adapters
→ route/domain UI
```

There is no evidence to run `shadcn init`, create a second CSS root, replace Base
UI, remove `Field`/`FormField`, or rebuild all of `@comtammatu/ui`. Continue
convergence: remove dead debt, lock contracts with guards, add accessibility/PWA
runtime evidence, and roll out by route family.

## 2. Quantitative baseline

| Area | Result | Decision |
| --- | --- | --- |
| Page census | 123/123 pages mapped; none missing or stale | Keep archetype registry; review each route in P6 |
| Archetype | LIST 46, DETAIL 16, SETTINGS-PANEL 13, DOC-WORKFLOW 12, LANDING 9, EMBED-WRAPPER 8, REPORT 6, BOARD 3, DASHBOARD 3, GATE/AUTH 3, REDIRECT-SHIM 3, PUBLIC-WORKFLOW 1 | Add no new archetype |
| Shared UI adoption | Registry classifies all shared/app/domain adapters; blocking-zero signals are currently zero | Keep registry and ratchet |
| Base UI boundary | Direct imports exist only in `packages/ui` | Keep and continue blocking app escapes |
| CSS SSoT | Only `packages/ui/src/styles/globals.css` | Keep one root |
| Legacy CSS variable names | No names contain `legacy`, `old`, `v1`, or `compat` | Add preventive guard; do not touch `Field` |
| Raw palette / `transition-all` | No runtime finding | Keep blocking-zero |
| Inline style | Mostly runtime geometry, CSS variables, chart/progress, theme/error boundary | Classify and ratchet; do not mass-delete |
| Shadcn | No runtime config or generated component | Keep reference-only |
| Accessibility automation | No `@axe-core/playwright` yet | Add in P3 |
| PWA | SW boundary and static tests are correct; browser runtime proof is incomplete | Keep strategy; add coverage/proof |

Static green is not browser, assistive-technology, or Production proof.

## 3. External-agent reconciliation

| Agent | Observed result | Usable finding |
| --- | --- | --- |
| `claude` | Completed a read-only review with `path:line` evidence | Three custom utilities have no consumers; page count `135` is stale in prose; retain SW, registry, and focus/motion foundations |
| `cursor-agent` | Completed a plan-mode review with `path:line` evidence | Keep/tune/rebuild census and Axe coverage were missing; PWA proof was static only; `Input.size` is a migratable compatibility alias |
| `agy` | Produced no usable review | Headless execution was blocked by MCP permissions; interactive execution reported no login/credit. Do not bypass permissions or invent findings |

Codex rechecked accepted findings against current source. Broad rebuild proposals, SW cache-strategy changes, removing `Field`/`FormField`, changing the global Button default, and applying Liquid Glass to data/form workspaces were rejected.

## 4. Confirmed debt classification

### Tune immediately at the shared owner

- Remove `bg-glass-nav`, `scrollbar-thin`, and `active-touch-press`: all three have only a definition and no consumer.
- Migrate every `Input size=` use to `controlSize=`, then remove the compatibility alias.
- Add a guard against legacy-meaning CSS variable names and recreation of the `Input.size` alias.
- Correct archetype prose from `135` to the current census; the live number remains script-owned.
- Add `@axe-core/playwright` and a representative accessibility project.
- Add a Runner manifest test so POS/KDS/Runner have symmetric contract coverage.

### Keep with an explicit owner

- Inline styles for charts, geometry, progress, CSS-variable bridges, theme bootstrap, and the `global-error` boundary.
- Safe-area, print, PWA, and dynamic-viewport utilities with active consumers.
- Serwist `NetworkOnly` for mutations, RSC, Supabase, Self-order, and authenticated navigations.
- The global reduced-motion backstop and named motion tokens.
- The current card/surface/component registry.

### First route-tune tranche

`/br/[branchId]/shift/checkout-approvals` is the first small Branch runtime tranche because it has a concrete finding: the details Drawer uses `ScrollArea` with only `maxHeight`, a self-styled label, and a checklist with self-built chrome. Fix it in the shared staff-runtime presenter without changing the loader, action, or authority.

## 5. Preliminary repository disposition

At C0, all 123/123 pages have a preliminary `keep` disposition for their current authority/archetype because the route census and UI contract are green. Here, `keep` means only “no source-level reason to rebuild”; it is not browser approval.

Initial overrides:

- `tune`: `/br/[branchId]/shift/checkout-approvals` for the finding above.
- `tune`: representative public/auth/system surfaces to add Axe evidence without changing IA.
- `tune`: PWA manifest/runtime test surface without changing cache strategy.
- `rebuild`: no route has sufficient evidence at C0.

P6 must reopen disposition through the UI Advisor Gate and runtime evidence for each route family. A route keeps its final `keep` status only after appropriate viewport, state, and accessibility evidence exists.

## 6. UI Advisor Gate — Branch checkout approvals

```text
UI Advisor Gate
- Surface: /br/[branchId]/shift/checkout-approvals; route family: branch_shift; plane: Branch; change: visual + behavior
- Context: Branch shift approval workflow; actor: branch manager/owner; job: review and approve or reject a checkout request
- Journey: pending request → inspect checklist → approve/reject → row removed; recovery: close drawer or cancel confirmation
- Information order: 1) pending employee/request 2) checklist completion 3) secondary branch/shift detail; exclude: payroll and unrelated staff history
- Pattern: LIST, Branch review variant; exemplar: /br/[branchId]/shift/leave-approvals
- States: empty, no-permission, pending mutation, details, destructive confirmation, success/error feedback
- Components: Drawer, ItemGroup/Item, SectionLabel, Badge, Button, AppEmptyState; fallback: route-scoped composition only
- Responsive/accessibility: same touch IA; keyboard-operable row and drawer; visible label; sticky actions; scroll body must have a definite flex boundary
- Verification: focused static tests, 390/768/1024 runtime when authenticated environment is available, keyboard/focus and axe in representative suite
```

## 7. Confirmed wave order

1. P2: dead CSS, compatibility aliases, docs, and guards.
2. P3: Axe dependency/project/spec and focused accessibility fixes.
3. P4: confirm CSS/motion convergence after ratcheting.
4. P5: Runner coverage and the production-like PWA proof boundary.
5. P6: Branch checkout approvals, followed by operational/global chrome tranches in the living plan.
6. P7: at most two observe/measure/challenge/fix/verify/encode loops per tranche.
