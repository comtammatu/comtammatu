# Admin UI Layout Audit — "lệch / bể layout"

**Date:** 2026-06-28
**Scope:** Admin module (`apps/web/app/(protected)/admin/**`) + the shared chrome that builds it (`app-shell.tsx`, `surface.tsx`) + the token root (`packages/ui/src/styles/globals.css`).
**Authority:** `docs/spec/design-system.md` (locked "Com Tam Ma Tu Custom Theme" contract). Actual tokens: `packages/ui/src/styles/globals.css`. Enforcement: `scripts/check-ui-contract.mjs` (`pnpm lint:ui-contract`), `pnpm audit:ui-components`.
**Method:** READ-ONLY. Five lanes read every file in scope fully and measured code against spec clauses. `pnpm lint:ui-contract` PASSES today — so every finding below is GREEN in CI; the gates do not catch it.

## Executive Verdict

The Admin "lệch / bể layout" is NOT a token-root problem and NOT a shell padding-compounding problem. Both of those, the two scariest hypotheses, were investigated and **disproven**:

- **Tokens (`globals.css`) are highly conformant** — radius, heading, height, icon, motion, elevation, density all match contract. Only dead orphan tokens and one contract-blessed 17px root remain.
- **Page Padding Authority (§668) is correctly enforced** — the shell `<main>` pads once (`p-3 md:p-4`), `AppShellPaddingBoundary` marks it, every Admin page defers. No page double-pads.

The real misalignment is concentrated in **one place with one root cause**: the **Settings subtree is split-brained on field construction and width**. `general` uses the correct `form/*` layer (h-10 fields, single-sourced); `payments` and `printers/templates` hand-build fields from bare `Input`/`Select`/`Label` primitives (h-7, `text-base` labels, `mt-*` margins, `rounded-md border p-4` card-in-card panels). Within one Settings flow, identity fields are 40px tall and payment fields are 28px tall — the dominant visible "lệch". Compounding it: the Settings `layout.tsx` renders a full-width nav over `width="default"` (max-w-5xl) content, so the nav bar overhangs the form, and pages disagree on width (default vs wide) and density (compact vs comfortable). Fixing the four root causes (§§ below) collapses ~80% of the page-level symptoms.

### Severity Tally

| Severity | Count | Definition |
| -------- | ----- | ---------- |
| P0 | 0 | Real layout break / overflow / unusable. **None found** — the one P0 hypothesis (11-col stock-movement table clip) was disproven; the Table primitive self-wraps in `overflow-x-auto`. |
| P1 | 5 | Token/rhythm violation causing visible misalignment, or a shell composition bug |
| P2 | 7 | Drift/inconsistency vs contract |
| P3 | 10 | Minor drift / hygiene |
| **Total** | **22** | |

P1 breakdown: F1, F2 (settings field-idiom split), ADM-CONSIST-1 (settings nav width), ADM-CONSIST-2 (two field idioms, cross-page view of F1/F2), ADM-ENFORCE-3 (inline-chrome gate hole that let the panels in).

---

## 1. Layout-Break Root Causes (ordered by blast radius)

These are the upstream causes. Fix these first; most page-level symptoms vanish.

### RC-1 — Settings field construction is split-brained: bare `Input` (h-7) vs `form/*` (h-10) [P1, blast radius: every non-general Settings page]

`general/settings-form.tsx` is the correct pattern: `AppSection` + `FieldGroup` + `TextField` → h-10 fields. But `payments-form.tsx` (`:137-178`) and `printers/templates/templates-client.tsx` (`:469-657`) hand-build fields from the **bare** `Input`/`Select`/`Textarea`/`Label` primitives, which render `h-7`/`text-xs`. Spec §275/§279/§283: bare `Input` is `h-7`; composite form controls MUST route through `apps/web/app/components/form/*` for the single-sourced `h-10`. Result: inside ONE Settings module, identity fields are 40px and payment/template fields are 28px — the dominant "lệch". This bare-primitive choice cascades into RC-2, RC-3, and RC-4 below; they are all downstream of the same decision.

### RC-2 — Hand-rolled `rounded-md border p-4` card-in-card panels nested inside AppSection [P1, blast radius: payments + templates]

`payments-form.tsx:108,186,216` wrap controls in `flex flex-col gap-3 rounded-md border p-4` divs — *inside* an `AppSection`, which is already a Card. Spec §197/§207: card padding MUST come from `Card`/`AppSection`, not ad-hoc `p-4` on a raw div. This produces a second nested frame (doubled borders/insets) inside the section card and re-implements surface chrome the primitive already owns. Note: this is the class of drift the `inline-chrome-baseline` gate is meant to stop, but its signature requires a `bg-card`/`bg-background` token in the class — these bg-less panels escape (see ADM-ENFORCE-3 / Enforcement Gaps).

### RC-3 — Settings nav is full-width while content is centered narrower (width disagreement) [P1, blast radius: whole Settings family]

`settings/layout.tsx:13` wraps `<SettingsNav/>` + children in a full-width `flex flex-col gap-4`; the leaf `SettingsPageFrame` defaults to `width="default"` → `AppPage max-w-5xl` (surface.tsx). So the tab nav row spans the full main column while the form below is constrained to `max-w-5xl` and left-anchored — nav and content edges don't line up. Additionally the two `width="wide"` pages (printers/jobs/templates) don't line up with the two `default` pages (general/payments): switching tabs jumps content width. This is the most visible *horizontal* "lệch" on Settings.

### RC-4 — Gap-on-gap-on-gap rhythm stack + ad-hoc margins break vertical rhythm [P1→P2, blast radius: Settings vertical rhythm]

The shell renders `flex flex-col gap-4` (app-shell content), `settings/layout.tsx:13` adds a SECOND `flex flex-col gap-4`, and the page's `AppPage` adds a THIRD `gap-4` — three gap containers stacked on near-zero-height boundaries (§209: gap belongs on one container). On top of that, leaf forms add per-element margins (`mt-1` on Switch, `mb-3` on toolbar, `mt-2` on errors — payments-form.tsx:126,254; templates-client.tsx:352,460), which double-meter the AppSection body's own `gap-3`. Each offset is small; they accumulate into the "lệch" the owner reports.

**Not a root cause (disproven hypotheses, recorded so they are not re-investigated):**
- Double-padding in the shell — **NOT present**. Page Padding Authority §668 is correctly enforced.
- Token drift in `globals.css` — **NOT present**. Root layer is conformant; downstream drift is not inherited from tokens.
- 11-column stock-movement table overflow/clip — **NOT a break**. `Table` primitive self-wraps in `overflow-x-auto` (table.tsx:11); the wide ledger scrolls natively.
- Triple-identical-title on Settings — **overstated** (U2 verify note). The SettingsNav tab renders `"Chung"`, not the full title; only the header-tail span and page H1 echo, which is the universal accepted AppShell convention, not a Settings break. Downgraded to P3 (ADM-SHELL-2).

---

## 2. Drift Matrix (U5, verbatim)

Page padding is single-sourced by `AppShell <main> p-3 md:p-4` + `AppShellPaddingBoundary`, so all pages correctly DON'T double-pad — that part is healthy. The drift is in width / density / field-idiom / card-surface, marked in bold.

| dim | dashboard | reports | settings/general | settings/payments | settings/printers(jobs) |
|---|---|---|---|---|---|
| AppPage width | wide | wide | **default(max-w-5xl)** | **default** | **wide** |
| density | **compact** | comfortable | comfortable | comfortable | comfortable |
| section gap | gap-3 | gap-4 | gap-4 | gap-4 | gap-4 |
| card surface | AppSection | AppSection | AppSection | AppSection **+ raw rounded-md border p-4 panels** | AppSection |
| input height | n/a | **bare Input h-7** | **form/TextField h-10** | **bare Input h-7** | n/a |
| KpiRow | density=compact | — | — | — | **default density** |

Reading the matrix: the **input height** row is the field-idiom split (RC-1); the **card surface** row is the card-in-card panels (RC-2); the **width** row is the centered-vs-full-width nav mismatch (RC-3); the **density** row is the dashboard-only compact outlier (ADM-CONSIST-5).

---

## 3. Per-Lane Findings

### 3.1 Tokens & Globals Conformance (root layer)

**Summary:** The token/globals root layer is highly conformant — it is NOT the root cause of Admin "lệch". `packages/ui/src/styles/globals.css` (648 lines) was read fully against Token/Typography/Rhythm/Radius/Height/Icon/Motion/Elevation/Density, plus postcss config, `app/layout.tsx`, both `components.json`, and the radius/heading/icon gates (which pass — baseline not increased). CORRECT and not inherited downstream: Radius §285 (`--radius:0.625rem`; `rounded-md/lg/full/none` the 4 app tiers; the 7-key surface sanctioned by §296); Heading §211 (AppPageHeader H1 = `font-heading text-xl sm:text-2xl font-semibold tracking-tight`, surface.tsx:191; CardTitle scales, card.tsx:36-39); Height §252 (Button cva h-6/7/8/9, min-h-12/14; bare Input h-7, input.tsx:11); Icon §238; Density §300; Motion/Elevation tokens; OKLCH-only (no hex/rgb leak); dual-mode parity; PWA themeColor `#fff6ee` == `--background`. Only two minor drifts, neither causing layout break. **Implication: re-point investigation at SHELL COMPOSITION + page-level usage, not token definitions.**

| ID | Sev | Title | Evidence (file:line) | Spec clause | Recommendation | Effort |
|---|---|---|---|---|---|---|
| TG-1 | P3 | Orphaned radius tokens `--radius-xl/2xl/3xl/4xl` have zero consumers | `packages/ui/src/styles/globals.css:66-69`; rg across apps/ + packages/ (excl globals.css) → ZERO refs to `rounded-xl\|2xl\|3xl\|4xl` or `var(--radius-xl..4xl)` | Radius §285-296 (sm/md/lg consumed indirectly via Card/Sheet; xl+ consumed by nothing) | Drop `--radius-xl/2xl/3xl/4xl` from `@theme inline` (keep sm/md/lg) or add a one-line reserved-unused comment. Migrate no app code (nothing consumes them). | S |
| TG-2 | P3 | 17px root font-size rescales the entire rem token system (context, not a violation) | `packages/ui/src/styles/globals.css:601` `html { font-size: 17px }` → 1rem=17px, every rem utility ×1.0625 | n/a — explicitly sanctioned by `tasks/regressions.md:138` (Zone C, D038), enforcement-authority tier | No change. Keep in mind when triaging "spacing feels off by ~1px" — this base is working as designed, not a page bug. | S |

### 3.2 Admin Chrome Frame

**Summary:** Traced the full Admin frame nest: `admin/layout` → `OfficeModuleShell` → `ManagementShell` → `AppShell` (one `SidebarProvider`/`Sidebar`/`SidebarInset`) → sticky `<header>` + `<div flex-1 p-3 md:p-4>` → `AppShellPaddingBoundary` → `<div flex min-h-0 flex-col gap-4>` → page slot. GOOD NEWS — the headline "double padding" fear is NOT present: Page Padding Authority §668 is correctly enforced (shell `<main>` pads once, surface defers, no leaf sets ad-hoc root padding; `pnpm lint:ui-contract` passes). The real shell issues are in the Settings subtree composition and one latent shared-header bug, not in padding.

| ID | Sev | Title | Evidence (file:line) | Spec clause | Recommendation | Effort |
|---|---|---|---|---|---|---|
| ADM-SHELL-4 | P2 | Settings nav uses a parallel Tabs bar idiom competing with shell breadcrumb/tier-2 | `ADMIN_NAV_GROUPS` exposes only dashboard/reports/settings (`packages/shared/src/auth/nav-config.ts:35-60`), so sub-pages aren't in sidebar tier-2; a separate `SettingsNav` Tabs bar (`settings-nav.tsx:57-82`) owns real sub-nav | §646 Nav Single-Source ("navigation is data, not per-shell code"); Chrome Archetypes §595 ("a route may not invent a second sidebar idiom") | Either promote Settings sub-pages into the office deep-nav resolver (tier-2 sub-tabs in the one sidebar, delete the Tabs bar), or treat SettingsNav as in-content sub-nav inside one `AppPageHeader.tabs` slot (surface.tsx:159,218) rather than a layout-level band | M |
| ADM-SHELL-3 | P2 | Nested sticky: `mobileTopBar sticky top-0` mounted inside the already-sticky header | header is `sticky top-0 z-30` (`app-shell.tsx:309`); mobileTopBar slot at `:373-377` renders `<div className="sticky top-0 z-10 ...">` — inert sticky, and `z-10` below sibling `z-30` | §615 (canonical header lockup is a shared primitive — slots must behave correctly for every consumer) + §549 | Remove the inner `sticky top-0 z-10` from the mobileTopBar wrapper (it inherits header stickiness), or fold the mobile band into the sticky header flow. One sticky context per header. Latent (Admin doesn't pass it today; inventory/branch shells do). | S |
| ADM-SHELL-2 | P3 | Header-tail span and page H1 echo the same title on Settings (NOT triple-title) | sticky-header span (`app-shell.tsx:351`) shows "Cài đặt chung" (`shell-primitives.ts:67`); page H1 (`settings-page-frame.tsx:22`) shows the same. The SettingsNav tab renders `copy.general="Chung"` (`settings.ts:4`), a DISTINCT nav strip — the "triple identical title" claim is false | §550 (no repetition) prefers it, but header-tail + page H1 is an accepted universal AppShell convention on every admin page; no break, no overflow | Optional: header span `text-foreground` and/or single trailing breadcrumb crumb for clearer hierarchy. Not a Settings-specific bug. Low priority. | S |
| ADM-SHELL-5 | P3 | Breadcrumb + pageTitle both muted, flattening header hierarchy | breadcrumb uses `text-muted-foreground` (`app-shell.tsx:330,335`); visible title is `text-sm font-medium` (`:351`) with real H1 `sr-only` (`:354`); both in one `flex flex-wrap gap-2` (`:313`) | Heading Scale §211 (chrome header title is intentionally smaller but should out-rank its breadcrumb) | Give header title span `text-foreground` and/or reduce breadcrumb to a single trailing crumb: muted trail → foreground current page | S |

### 3.3 Admin Pages: dashboard + reports

**Summary:** 11 files. **No P0 layout break.** The one P0 hypothesis (11-col stock-movement table) was disproven — `Table` self-wraps in `overflow-x-auto` (table.tsx:11), so the wide ledger scrolls natively, not clipped. Frame files (page/error/loading/not-found, both redirects) all clean, route through `ErrorPanel`/`PageSkeleton`/`NotFoundPanel`/`redirect` per §804. `dashboard/page.tsx` + `owner-work-queue.tsx` + `owner-view-model.ts` clean (compose `AppPage density=compact`/`KpiRow`/`KpiCard`/`AppSection`/`Item`/`AppEmptyState` correctly; money via `formatVND`). `reports/page.tsx` clean (`AppLinkCard`/`LinkCardGrid`). Only `reports/stock-movement-client.tsx` has real drift — concentrated, not scattered.

| ID | Sev | Title | Evidence (file:line) | Spec clause | Recommendation | Effort |
|---|---|---|---|---|---|---|
| ADMIN-PG-01 | P2 | Stock-movement filter controls bypass the form/* field layer (height drift) | `reports/stock-movement/stock-movement-client.tsx:253-291` — bare `Input type="date"` (h-7) at `:255,:265` with hand-rolled `<Label>` + `flex flex-col gap-1.5`, raw `<SelectTrigger className="w-full sm:w-44">` at `:277` | Height Scale §275/§280 (date/select field-triggers must be h-10 via form/business-date-field, form/select-field) + gate `admin-finance-branch-toolbar-fixed-control` (frozen baseline 1, scripts/check-ui-contract.mjs:232) | Route the two date inputs through `form/business-date-field` and the branch select through `form/select-field` (h-10), drop the hand-rolled Label/gap-1.5 wrappers + local `sm:w-44`; decrement the allowlist | M |
| ADMIN-PG-02 | P2 | Mobile movement cards use margin (mt-4/mt-1) for vertical rhythm instead of gap | `stock-movement-client.tsx` — `ItemContent className="mt-4 grid grid-cols-2 gap-3"` at `:377,:457`; `mt-1` on value `<p>` at `:382,:388,:396,:404,:412,:420,:428,:436,:462,:470,:478,:486,:494,:502,:510` (16 total) | Rhythm Contract §209 (vertical rhythm uses flex gap, not margins) + §191 (within-section gap = gap-2) | Replace `mt-4` on ItemContent with Item/ItemContent default gap; replace each `mt-1` label→value with `flex flex-col gap-1`. No margins on children. | S |
| ADMIN-PG-03 | P3 | Hand-set `text-xs` on three `size="sm"` preset Buttons overrides primitive type scale | `stock-movement-client.tsx:298,:306,:314` — `<Button variant="outline" size="sm" className="flex-1 text-xs sm:flex-none">` on the 7/14/30-day presets | Height Scale §252 / §181 ("do not change primitive radius, color, focus … from a page wrapper"); `size="sm"` already sets text scale | Drop `text-xs`; rely on `size="sm"`. If a denser chip type is genuinely wanted, add it as a Button variant once, not per page. | S |
| ADMIN-PG-04 | P3 | Dead/misleading `md:overflow-x-auto` on DataTable (real scroll is the Table container) | `stock-movement-client.tsx:358,:453` pass `className="md:overflow-x-auto"` to DataTable, which applies it to its outer `flex flex-col` wrapper (data-table.tsx:240); actual scroll is Table's own `overflow-x-auto` (table.tsx:9-12) | List Surface §394-403 (scroll via named primitive props, not local overflow overrides) + §207 | Remove `md:overflow-x-auto` from both DataTable calls; the Table primitive already provides horizontal scroll. Edge-flush is already handled by `AppSection contentFlush`. | S |
| ADMIN-PG-05 | P3 | Stale gate allowlists for admin lane point at zero actual hits (gate hygiene) | `scripts/check-ui-contract.mjs:794` `space-y-baseline` allowlists stock-movement=3 but `rg space-y` → 0; `:845` `gap-atypical-baseline` dashboard=1 but → 0 hits; `:295` `vnd-format-ssot` dashboard=2 are the correct `formatVND` import+usage (permanent false positive) | Enforcement Status / gate-precision §731 ("reconcile a stale allowlist for free; never lower below actual") | Set `space-y-baseline` stock-movement to 0, `gap-atypical-baseline` dashboard to 0. Leave `vnd-format-ssot` dashboard as a documented false-positive per §757. | S |

### 3.4 Admin Pages: Settings subtree (file-by-file)

**Summary:** Read all 11 lane files fully + the upstream primitives (`surface.tsx` `AppPage`/`AppSection`/`AppPageHeader`, `Input`/`Label`/`Select`, `form/text-field`+`select-field`). `pnpm lint:ui-contract` PASSES, so every issue is prose-contract drift the regex gate does not catch — the "documented but unenforced" gap §687 warns about. ROOT CAUSE: the settings module is split-brained on field construction. `general/settings-form.tsx` is correct (`AppSection`+`FieldGroup`+`TextField`, h-10). But `payments-form.tsx` and `templates-client.tsx` hand-build from BARE `Input`/`Select`/`Label` (h-7/text-xs), which cascades into ad-hoc `rounded-md border p-4` cards (§197/§207), `text-base` Labels (collides with CardTitle role §216), and `mt-1`/`mt-2`/`mb-3` margins (§209). CLEAN (no findings): `page.tsx`, `loading.tsx`, `settings-page-frame.tsx`, `general/page.tsx`+`settings-form.tsx`, `payments/page.tsx`, `printers/page.tsx`, `jobs/page.tsx`, `print-jobs-client.tsx`. Fixing F1 + F2 by migrating to `form/*` resolves heights, label scale, card padding, and margins together.

| ID | Sev | Title | Evidence (file:line) | Spec clause | Recommendation | Effort |
|---|---|---|---|---|---|---|
| F1 | P1 | payments-form rebuilds fields from bare Input/Label/Switch → h-7 controls + ad-hoc cards (root cause) | `payments-form.tsx:137-178` three bare `<Input>` (h-7 via input.tsx:11) with hand-rolled `<Label>`+error `<p>`; lines `108,186,216` three `flex flex-col gap-3 rounded-md border p-4` cards inside AppSection | Height §279/§283 (route bare Input through form/* for h-10 §280); Component Authority §470 (raw Input vs form wrapper); Spacing §197/§207 (card padding from Card/AppSection, not ad-hoc p-4 boxes) | Replace the three raw Input blocks with `TextField` from `@/components/form`; render the VietQR/SePay/MoMo groups as `AppSection`/`Card` bodies, not `rounded-md border p-4` divs | M |
| F2 | P1 | templates-client uses bare Input/Select/Textarea/Label for editor + save dialog → h-7 fields, no form layer | `templates-client.tsx:469-480` bare `<Select>` test-branch trigger (h-7); `:516-523` bare `<Input>` in save Dialog; `:608-657` BlockFields raw `<Input>`/`<Textarea>` with hand `<Label>`; `:512,525` `flex flex-col gap-1.5` reimplement Field spacing | Height §279/§283 (bare h-7 vs form/* h-10 §280-281); Component Authority §464/§470 (form composition belongs to form/*, not page-local label+input) | Route test-branch + paper-width selects through `SelectField`, save-name input through `TextField`/FormDialog, reuse `Field`/`FieldGroup` for BlockFields instead of raw `flex flex-col gap-1.5` + `<Label>` | M |
| F3 | P2 | text-base on form Labels collides with section-title heading role | `payments-form.tsx:115,188,218` `<Label className="text-base">`; Label primitive is `text-xs/relaxed font-medium` (label.tsx:16) | Heading §216 (`text-base font-semibold` is the locked Section-title role from CardTitle); §217 (sub-section = text-sm) | Drop `text-base`; if these rows need a heading, render as their own `AppSection` (title from CardTitle). Keep Label at primitive size. | S |
| F4 | P2 | Ad-hoc margins (mt-1/mt-2/mb-3) break the gap-based vertical rhythm | `payments-form.tsx:126,254` `<Switch className="mt-1">`; `templates-client.tsx:352` `mb-3` add-block toolbar, `:460` `mt-2` preview error | Spacing §209 (vertical rhythm uses gap, not margins; AppSection body already supplies `flex flex-col gap-3`, surface.tsx:369) | Remove the margins; let parent flex `gap-*` own spacing. Align the Switch with `items-center`/`items-start` rather than `mt-1`. | S |
| F5 | P3 | Redundant inner gap wrappers inside AppSection re-declare spacing AppSection already owns | `payments-form.tsx:108/186/216` inner `flex flex-col gap-3`/`gap-2` inside AppSection (gap-3 children, surface.tsx:369); `templates-client.tsx:465` `gap-3`, `:435` `gap-4` | Spacing §200/§207 (section gap set by AppPage/AppSection; within-section = gap-2) | Lean on AppSection body gap; add inner gap only when content needs gap-2 inline rhythm, kept consistent across sibling cards | S |
| F6 | P3 | Template preview image uses bg-white + shadow-sm + fixed w-72 (off-token paper mock) | `templates-client.tsx:446` `<img className="mx-auto w-72 max-w-full border bg-white shadow-sm">` | Elevation §356 (no resting drop-shadow); `bg-white` raw color outside OKLCH surface (Token Contract); `shadow-sm` not in approved set §337/§357 | If the paper sheet needs elevation, use an approved `shadow-effect-*` rung; consider a token-backed paper bg instead of literal `bg-white`. Low priority — intentional paper metaphor. | S |

### 3.5 Cross-Page Consistency + Enforcement Gap

**Summary:** `pnpm lint:ui-contract` PASSES (baseline not increased); `audit:ui-components --family admin` = orientation table, not a gate. So every drift below is GREEN today — the holes are real. Page padding is single-sourced (healthy; no double-pad). Root-cause findings: (1) Settings nav full-width vs centered content; (2) two field idioms in one settings surface; (3) dashboard-only compact density; (4) mixed label scale within payments. The decisive enforcement gap: `inline-chrome-baseline` requires a `bg-card`/`bg-background` token in the class, so payments' bg-less `rounded-md border p-4` panels escape; `raw-padding-baseline` only flags `p-5+`, so `p-4`-on-a-div is invisible; and NO gate enforces input-construction idiom, page-width consistency, or density consistency within a route family.

| ID | Sev | Title | Evidence (file:line) | Spec clause | Recommendation | Effort |
|---|---|---|---|---|---|---|
| ADM-CONSIST-1 | P1 | Settings nav is full-width but content centered narrower → horizontal misalignment | `settings/layout.tsx:13` full-width `flex flex-col gap-4` over `<SettingsNav/>`+children; `settings-page-frame.tsx:18` defaults `width="default"` → AppPage max-w-5xl (surface.tsx:40-45); general/payments default, printers/jobs/templates `wide` | Surface Contracts ADMIN §513; Page Padding Authority / centered max-width §668-678; Layout Patterns §543 | Pin one width for the settings subtree: render SettingsNav INSIDE the same AppPage width as content (move nav into SettingsPageFrame, or set every settings leaf to one width) so nav and form share the centered column | S |
| ADM-CONSIST-2 | P1 | Same settings surface uses two field idioms: form/TextField (h-10) vs bare Input (h-7) + hand-rolled panels | general: `settings-form.tsx:12,79` uses `form/TextField` (h-10 §280). payments: `payments-form.tsx:10` imports bare `Input` (h-7), at `:137,153,169` builds fields by hand in `flex flex-col gap-1` + manual `<Label>`; 3 `rounded-md border p-4` panels (`:108,186,216`) inside an AppSection Card | Height §277-283 ("route through the form/* wrapper so field height stays single-sourced"); Component Authority §467-471 (forbidden page-specific clones); ADMIN §518 (CRUD dialogs use shared form helpers) | Rebuild payments-form on form/* wrappers (TextField + SwitchField), drop the inner `rounded-md border p-4` panels — let AppSection be the only surface; group with FieldGroup, not nested card chrome | M |
| ADM-ENFORCE-3 | P1 | inline-chrome gate misses bg-less hand-rolled card panels (signature requires bg-card/bg-background) | `scripts/check-ui-contract.mjs:867-868` `inline-chrome-baseline` requires rounded-(md\|lg) AND border AND bg-(card\|background); `payments-form.tsx:108,186,216` use `rounded-md border p-4` with NO bg token → not counted, gate stays green | inline-chrome-baseline intent §863-866; Radius Card tier §292 (Card/AppSection should own framed surfaces) | Broaden the lookahead to rounded-(md\|lg) AND border AND NOT inside a primitive (drop the bg-card requirement), or add a sibling `bordered-inset-panel` gate matching `rounded-md border` + padding on a raw div. Baseline current hits, burn down (payments first). | M |
| ADM-ENFORCE-4 | P2 | raw-padding gate only flags p-5+, so p-4-on-a-div (real padding-on-non-primitive drift) is uncatchable | `scripts/check-ui-contract.mjs:810` `raw-padding-baseline` pattern is `(p\|px\|py\|…)-(5\|6\|7\|8\|9\|10\|11\|12\|14\|16\|20\|24)` — p-4 excluded by design; payments-form's three `p-4` panels pass | Spacing §207 ("card padding MUST come from Card / Card size=sm"); §197 (Card inner p-4 = primitive-owned) | Add a narrow gate: `p-4`/`p-3` together with `border` + `rounded` on a non-primitive div (card-clone signature); pairs with ADM-ENFORCE-3. Keep plain p-4 (inside real flex layouts) allowed. | M |
| ADM-CONSIST-5 | P2 | Dashboard is the only Admin page on density=compact; siblings comfortable → inconsistent section rhythm | `dashboard/page.tsx:75` `<AppPage width="wide" density="compact">` + `:85` `<KpiRow density="compact">`; reports/page.tsx:48, stock-movement:329, all SettingsPageFrame = comfortable (gap-4); printers/jobs/page.tsx:175 `<KpiRow>` no density (gap-3) vs dashboard compact (gap-2) | Density Modes §300-302; Spacing §200 (section gap default gap-4 / compact gap-3) | Decide one Admin density policy (ADMIN §513 favors dense workspaces → likely compact for all, or comfortable for all) and apply uniformly; make KpiRow inherit page density instead of per-call density props | S |
| ADM-ENFORCE-6 | P2 | No gate enforces field-construction idiom (bare Input vs form/* wrapper) — the h-7/h-10 split is unguarded | Only height gate is `button-height-on-button` (`scripts/check-ui-contract.mjs:721`, Button-scoped); §275 requires form/* for h-10 but nothing flags bare `Input` as a form field. payments-form:137/153/169 + stock-movement:255/265 use bare Input with zero CI signal | Height §283 ("route it through the form/* wrapper"); Component Authority §382 (form input mapping) | Add a gate flagging `from '@comtammatu/ui/components/input'` (bare Input) imported into a *-form.tsx that also imports react-hook-form, steering to form/TextField; baseline current offenders, burn down | M |
| ADM-CONSIST-8 | P3 | Mixed label type scale within payments form (text-base vs text-xs) | `payments-form.tsx:115,188,218` Labels `text-base`; `:134,150,166` field Labels `text-xs`; general (via form/TextField) emits one consistent scale | Typography / Heading roles §211-218 (label scale role-driven, not ad-hoc); §176 ("do not add arbitrary dimensions") | Fold into ADM-CONSIST-2 rebuild: use form/* field labels (single scale) + a section-title role for toggle headers instead of text-base/text-xs on bare Label | S |
| ADM-ENFORCE-7 | P3 | No gate enforces page-width/density consistency within a route family | Width drift (default vs wide across settings, ADM-CONSIST-1) and density drift (ADM-CONSIST-5) both pass CI; no check correlates AppPage width/density across sibling pages; surface.tsx exposes both freely per page | ADMIN §515 ("shared page heading rhythm"); Route Home + IA §627 (family consistency is contract but unenforced) | Add an advisory check (or extend audit-ui-components) reporting per route family the set of distinct AppPage width+density values; fail when a settings-group mixes widths. Lower priority — review covers it once CONSIST-1/5 normalized. | L |

---

## 4. Enforcement Gaps (close these so the drift can't recur)

The whole audit is GREEN in CI — the gates have three structural holes that let exactly this drift in. Close them in this order; the first is the decisive one (it is how the payments panels got in green).

1. **`inline-chrome-baseline` requires a bg token** (ADM-ENFORCE-3, P1) — the gate's signature is `rounded-(md|lg)` AND `border` AND `bg-(card|background)`. The most common card-in-card drift — a bordered inset panel with NO bg inside an AppSection — escapes entirely. Fix: drop the bg-card requirement (match `rounded-(md|lg)` + `border` + padding on a non-primitive div), or add a sibling `bordered-inset-panel` gate. Baseline current hits, burn down payments first.

2. **`raw-padding-baseline` only flags `p-5+`** (ADM-ENFORCE-4, P2) — `p-4` is excluded by design (valid Card inner), but that means `p-4` on a raw div (cloning Card padding without being a Card) is invisible. Fix: a narrow gate for `p-4`/`p-3` together with `border` + `rounded` on a non-primitive div (the card-clone signature). Pairs with #1.

3. **No field-construction-idiom gate** (ADM-ENFORCE-6, P2) — only `button-height-on-button` exists; nothing flags a bare `Input`/`SelectTrigger` used as a form field outside `form/*`, so the h-7/h-10 split drifts page-to-page with no backstop. Fix: flag bare `Input` imports into a `*-form.tsx` that also imports react-hook-form; baseline payments + stock-movement, burn down.

4. **No family-level width/density consistency check** (ADM-ENFORCE-7, P3) — width (default vs wide) and density (compact vs comfortable) are per-page judgment calls across one route family, the exact thing the Rhythm Contract §187 says to avoid. Fix: advisory check (or extend `audit-ui-components`) reporting distinct AppPage width+density per family; fail when a settings-group mixes widths. Lowest priority — review covers it once CONSIST-1/5 land.

5. **Gate hygiene** (ADMIN-PG-05, P3) — three stale allowlists in `scripts/check-ui-contract.mjs` overstate this lane's debt (`space-y-baseline` stock-movement=3→actual 0; `gap-atypical-baseline` dashboard=1→0; `vnd-format-ssot` dashboard=2 = permanent false positive). Reconcile down to actual (never below) per §731/§757 so the next layout pass sees these files are already clean.

---

## 5. Fix Order

Strictly upstream-first. Most page-level findings become trivial or vanish once the shell/token root cause above them is fixed — those are marked **[auto-resolved]**.

### Phase 1 — `globals.css` tokens (lowest blast radius first, pure hygiene)
- **TG-1** — drop or comment the orphan `--radius-xl/2xl/3xl/4xl`. No app code migrates.
- **TG-2** — no change (contract-blessed 17px root); documented so downstream "off by ~1px" reports aren't misattributed.
- *Tokens are conformant; this phase is hygiene only and unblocks nothing downstream. It is first because the contract's Fix Order is tokens→shell→pages→enforcement, not because tokens cause the break.*

### Phase 2 — Shell / chrome composition (the real root causes — fix these and Settings symptoms collapse)
- **ADM-CONSIST-1 / RC-3** — pin ONE width for the Settings subtree (move SettingsNav inside SettingsPageFrame at a single width, or set every settings leaf to one width). Fixes the horizontal nav-overhang and the default↔wide tab jump in one move.
- **RC-4** — collapse the gap-on-gap-on-gap stack: remove the redundant `flex flex-col gap-4` in `settings/layout.tsx:13`; let the shell + AppPage own the gap.
- **ADM-SHELL-4** — promote Settings sub-pages into the office deep-nav resolver OR move SettingsNav into one `AppPageHeader.tabs` slot (removes the parallel sidebar idiom; pairs with CONSIST-1).
- **ADM-SHELL-3** — remove the inert inner `sticky top-0 z-10` on the shared mobileTopBar (latent, but it's the one shared header primitive).
- **ADM-CONSIST-5** — decide and apply ONE Admin density policy; make KpiRow inherit page density.
- **ADM-SHELL-2 / ADM-SHELL-5** — optional header-hierarchy polish (foreground title, single breadcrumb crumb).

### Phase 3 — Page-level cleanup (much of it auto-resolved by Phase 2/the form/* migration)
- **F1 / ADM-CONSIST-2 (payments)** — migrate payments-form to `form/*` (TextField + SwitchField). This single move **[auto-resolves]** F3 (text-base labels), F4 (mt-1 margins), F5 (redundant gap wrappers), ADM-CONSIST-8 (mixed label scale), and the RC-2 card-in-card panels (drop the `rounded-md border p-4` divs).
- **F2 (templates)** — migrate templates-client editor + save dialog to `form/*` (SelectField, TextField, Field/FieldGroup). **[auto-resolves]** its share of F4/F5.
- **ADMIN-PG-01 (stock-movement filters)** — route date inputs through `form/business-date-field`, branch select through `form/select-field`; decrement the toolbar allowlist.
- **ADMIN-PG-02** — replace mt-4/mt-1 margins with gap on the container.
- **ADMIN-PG-03** — drop `text-xs` on the three sm preset Buttons.
- **ADMIN-PG-04** — remove the dead `md:overflow-x-auto` on both DataTable calls.
- **F6** — optional: token-backed paper bg + approved shadow rung for the template preview image.

### Phase 4 — New lint rules (lock the door so this can't recur)
- **ADM-ENFORCE-3** (broaden inline-chrome to catch bg-less bordered panels) — decisive; baseline + burn down.
- **ADM-ENFORCE-4** (p-4-on-a-div card-clone gate) — pairs with the above.
- **ADM-ENFORCE-6** (bare-Input-in-*-form.tsx gate) — locks the field-idiom split.
- **ADM-ENFORCE-7** (family width/density consistency, advisory) — lowest priority.
- **ADMIN-PG-05** — reconcile the three stale allowlists down to actual.

**Net:** four upstream fixes (RC-1 field idiom, RC-2 card panels, RC-3 width, RC-4 gaps) — all reachable through the Phase-2 width pin + the Phase-3 `form/*` migration of payments + templates — eliminate the dominant Admin "lệch". Phase-4 gates ensure CI catches the next attempt instead of staying green.
