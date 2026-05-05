# 01 — Brand + Software Program

> Purpose: define how the new brand identity becomes a coherent software system.

## Program Thesis

The brand refresh should be visible in the product, but the product is an operations system for restaurants, not a marketing site.

The software refresh must therefore optimize for:

- speed at the cashier station
- clarity in kitchen queues
- reliable finance/tax workflows
- branch-scope correctness
- inventory trustworthiness
- Vietnamese business terminology
- consistent brand presence without visual noise

## Product Surfaces

| Surface | Primary job | Brand treatment |
|---|---|---|
| Login/onboarding | Fast, trustworthy entry point | Strongest brand expression. |
| Admin | Governance, settings, reports, staff | Dense workspace, clear hierarchy, restrained brand chrome. |
| POS | Order, table, payment, receipt | Minimal chrome; preserve cashier muscle memory. |
| KDS | Live kitchen execution | Queue clarity above all. Brand should not compete with ticket state. |
| Inventory | V2 workflow loop, stock control | Task-first IA, branch/location clarity, status semantics. |
| Finance | GL, VAT, HĐĐT, period close | Audit-first tables/forms; conservative styling. |
| HR/Employee | Attendance, payroll, profile, tasks | Lightweight mobile-first flows. |
| Print/PWA/offline | Receipts, installed app, local recovery | Brand consistency plus reliability. |

## Route-Family Rollout

Do not redesign random pages. Roll out by route family:

| Wave | Scope | Goal |
|---|---|---|
| W0 | Design foundation | Lock tokens, typography, logo use, icons, spacing, app shells. |
| W1 | Login + shared shell | Establish first impression and navigation consistency. |
| W2 | Admin + settings + staff | Owner/super-manager workspace, no domain workflow mirroring. |
| W3 | Inventory V2 | Clean V2 workflow and remove V1 mental model. |
| W4 | Finance + HR + Employee | Compliance and staff flows, terminology locked. |
| W5 | POS + KDS polish | Operational polish only after touch/live queue validation. |
| W6 | Print/PWA/docs | Receipts, manifests, installed shell, guide screenshots. |

## Brand Rules

- Brand identity must go through shared primitives and tokens.
- No per-route theme files.
- No decorative chrome on frontline screens.
- No arbitrary one-off colors or spacing.
- Vietnamese copy must use canonical terms.
- Tables, filters, forms, sheets, drawers, dialogs, and toasts must remain predictable.

## UX Principles

1. **Operational first**: the user should finish the restaurant task faster than before.
2. **Fewer hubs, clearer jobs**: routes should map to actual work, not feature-card galleries.
3. **Scope is visible**: branch, tenant, role, shift/session, and period should be explicit where risk exists.
4. **Status is semantic**: paid, served, issued, closed, pending, blocked, synced, conflict must not be decorative labels.
5. **Mobile is not a shrinked desktop**: POS/KDS/employee flows need touch-safe layouts.

## MVP Cut

For first green pilot, the brand/software refresh can ship with:

- polished login
- shared shell/navigation
- POS/KDS operational baseline
- Inventory V2 baseline
- Finance read/period safety baseline
- Employee profile/attendance baseline
- print receipt brand header

Defer:

- public marketing site
- advanced dashboards
- loyalty/CRM polish
- deep animation
- optional personalization
- theme customization

## Acceptance Criteria

- Every pilot surface has one clear primary job.
- Brand primitives are used consistently.
- POS/KDS first viewport remains task-dominant.
- No route family introduces a second design system.
- Owner can demo the system as “new Cơm Tấm Má Tư software”, not “old comtammatu with a logo”.
