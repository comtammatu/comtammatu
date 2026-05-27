# Interface Issue Closure - 2026-05-24

> Superseded on 2026-05-26 for UX rebuild authority: this worklog is historical
> evidence for current-runtime cleanup only. Do not use its design-system
> authority/source-of-truth wording as rebuild authority.

## Scope

Mục tiêu của round này là chốt toàn bộ vấn đề Interface đang mở thành backlog
có thứ tự, không redesign và chưa sửa runtime UI.

Interface ở đây bao gồm:

- Design-system authority và legacy visual layer.
- Route surface / navigation / role mental model.
- Operational UI quality cho POS, KDS, Inventory, Finance Basic, HR/Employee,
  Admin settings, public Feedback/Login.
- Static regressions về typography, spacing, radius, icon size, button height,
  fake primitives, and unsafe client state.

## Historical Source-Of-Truth Read Order

Đọc và khóa theo thứ tự:

1. `AGENTS.md`
2. `docs/agent/rules/engineering.md`
3. `docs/agent/rules/ui.md`
4. `docs/agent/rules/workflow.md`
5. `docs/agent/rules/references.md`
6. `docs/spec/design-system.md`
7. `docs/modules/ui.md`
8. `tasks/regressions.md`
9. `tasks/todo.md`
10. Domain worklogs: Inventory UX contract/evidence and Finance Basic contract.

## Current Worktree Constraint

Worktree đang có route-group migration lớn chưa stage: `git status --short`
đếm 634 entries. Nhiều file cũ đang `D`, các path mới dưới
`apps/web/app/(protected)` và `apps/web/app/(public)` đang untracked.

Vì vậy round chốt Interface phải làm theo thứ tự:

1. Không revert hoặc normalize worktree.
2. Chốt issue register trước.
3. Chỉ sửa từng wave nhỏ, trên route family rõ ràng.
4. Sau mỗi wave chạy tối thiểu static scan liên quan; trước khi mark complete
   implementation phải chạy `pnpm typecheck && pnpm lint && pnpm build`.

## Locked Verdict

`CONDITIONAL GO` cho Interface cleanup.

Không được bắt đầu bằng một redesign lớn. Đường đúng là:

1. Đóng design-system drift.
2. Đóng static UI-regression violations theo allowlist.
3. Đóng workflow/IA drift theo route family.
4. Chạy rendered QA cho surface vận hành trước: POS, KDS, Inventory.

## Issue Register

| ID | Priority | Surface | Problem | Evidence | Closure decision |
| --- | --- | --- | --- | --- | --- |
| `IF-001` | P0 | Design system | Legacy Inventory pilot layer still present: `matu-surface`, `matu-*`, `font-matu-body`, generated matu tokens, kitchen sink. | Static scan finds 4 files with legacy hits. `docs/worklog/ui-design-system-ssot-audit-2026-05-24.md` already marks this as NO-GO for starting rebuild UI. | Migrate/remove legacy layer only after route migration settles. Add static guard first. |
| `IF-002` | P0 | Worktree / routing | Interface work was sitting on a massive App Router route-group migration. | Current audit is clean: no staged route moves, no unstaged route counterparts, and no no-counterpart deletes. Full `pnpm typecheck && pnpm lint && pnpm build` passed. | Closed on 2026-05-24 after route-group migration was reconciled into `HEAD` and full verification passed. |
| `IF-003` | P1 | Rhythm / typography | App surfaces still violate locked heading scale. | Static scan finds 6 files with `text-4xl`, `text-5xl`, or `font-black`. | Closed on 2026-05-24: all runtime hits removed, heading-scale guard allowlist tightened to zero, and POS/KDS rendered smoke captured. |
| `IF-004` | P1 | Icon/media sizing | App surfaces still use banned icon-size classes. | Static scan finds 15 files with `size-7/9/11/14/16`; some may be allowed media thumbnails. | Closed on 2026-05-24: `size-7/9/11` app-surface hits removed, oversized icon glyphs reduced, and guard allowlist narrowed to media thumbnails only. |
| `IF-005` | P1 | Button/touch height | App surfaces still set raw fixed/touch heights instead of Button primitive variants. | Static scan finds 38 files with `h-10/11/12/14/16` or raw `min-h-12/14/16`. | Closed on 2026-05-24: real POS/KDS/Inventory actions moved to primitive touch sizing; guard allowlist narrowed to non-button layout/input/skeleton/brand cases. |
| `IF-006` | P1 | Radius rhythm | App code has broad raw radius usage and some banned radii. | Static scan finds 145 files with `rounded*` patterns needing triage. | Closed on 2026-05-24: POS/KDS touched route family has zero banned-radius hits; `radius-scale` guard now freezes remaining non-POS baseline debt. |
| `IF-007` | P1 | Inventory UX | Inventory has a previous evidence log with unresolved sign-off and stale status contradictions. | `docs/worklog/inventory/evidence-log.md` logs INV-UIUX-001..005, then later claims partial closure but final call still says not ready. | Closed on 2026-05-24: rendered rerun and follow-up fix updated `INV-UIUX-001..005=fixed`; Inventory sign-off remains not ready because broader route/persona coverage is incomplete. |
| `IF-008` | P1 | Inventory GRN drafts | Sprint 6 Stage B/C remains open around server-side drafts and localStorage removal. | `tasks/todo.md` Sprint 6 lists GRN client refactor, drafts page rewrite, URL flash -> toast. | This is the first concrete implementation wave after route/worktree stabilization. |
| `IF-009` | P1 | Finance Basic | Finance full is NO-GO for pilot; first screen must be four owner metrics, advanced accounting must not define pilot UX. | `docs/modules/finance.md` contract. | Closed on 2026-05-24: rendered owner QA confirms `/finance` first screen shows the four Finance Basic metrics, hides advanced accounting labels from the default landing/nav, and links through to `/finance/revenue`. |
| `IF-010` | P2 | Client persistence | Some localStorage usage is allowed for theme/install hint, but scope/workflow state must not persist in client storage. | Static scan finds 7 files using localStorage/sessionStorage. | Closed on 2026-05-24: classified current browser storage usage and added `lint:client-storage` allowlist guard for theme preference plus POS PWA install-hint dismissal only. |
| `IF-011` | P2 | Static guardrails | Design-system rules are documented but not yet enforced by automated checks. | Follow-up in SSOT audit recommends a static check. | Add a script/lint guard for new `matu-*`, banned font, and banned sizing classes before broad cleanup. |

## Closure Waves

### Wave 0 - Stabilize Current Diff

- Confirm the App Router route-group migration is intentional.
- Stage or split route move before UI runtime edits.
- Regenerate route inventory after move.

### Wave 1 - Static Guard First

- Add an allowlist-based static check for legacy `matu-*`, `font-matu-body`,
  banned heading scale, banned icon sizes, and raw touch button heights.
- Wire it to an existing repo verification path only after current violations
  are either fixed or allowlisted.

### Wave 2 - Legacy Layer Retirement

- Remove or migrate `/admin/kitchen-sink`.
- Remove `matu-surface` imports from production routes.
- Remove Be Vietnam Pro / `font-matu-body` runtime hook after no consumer remains.
- Archive or delete generated `matu-tokens` only after references are gone.

### Wave 3 - Operational Surfaces

Order:

1. Inventory GRN drafts and Inventory evidence re-run.
2. POS table/session/order/payment first viewport and touch controls.
3. KDS queue/filter/bump/realtime first viewport.
4. Finance Basic landing/navigation.
5. HR/Employee/Admin settings polish.
6. Public Feedback/Login smoke.

### Wave 4 - Rendered QA

For each surface:

- Run desktop and one mobile viewport.
- Check page identity, not blank, no framework overlay, console health,
  screenshot evidence, and at least one primary interaction.
- Store screenshots outside the repo unless explicitly requested.

## Stop Rules

- Stop if a UI fix requires changing the design-system contract first.
- Stop if route migration state makes path ownership ambiguous.
- Stop if a fallback changes product workflow semantics.
- Stop if a client component needs a server-only database import.
- Stop if a broad refactor would touch multiple route families in one wave.

## Wave 0 Probe - 2026-05-24

### Route Move Shape

Current `apps/web/app` status:

- `526` tracked files are deleted from old route locations.
- `538` untracked files exist under the new app tree when counted with
  `git status --porcelain=v1 -uall`.
- The new route tree exists under `apps/web/app/(protected)` and
  `apps/web/app/(public)`.
- `find apps/web/app -maxdepth 5 -type f \( -name page.tsx -o -name layout.tsx -o -name route.ts \)`
  shows the intended public/protected route groups are present.

File-level counterpart check:

- `421` deleted files have byte-identical counterparts at the expected route
  group path.
- `102` deleted files have counterparts at the expected route group path but
  content changed.
- `0` expected route counterparts are genuinely missing. A shell check reported
  3 false missing rows for the old `(auth)/login/*` path because the path
  contains parentheses; manual hash checks confirmed the new login files exist
  under `apps/web/app/(public)/(auth)/login/*`. `actions.ts` is byte-identical;
  `login-form.tsx` and `page.tsx` were changed.

Verification:

- `pnpm typecheck`: pass, but all packages were Turbo cache hits. Treat this as
  a useful signal, not full fresh validation.

### Wave 0 Decision

Route-group migration is structurally present and likely intentional, but not
ready for broad Interface edits until the changed counterpart set is reviewed
or the route move is staged/split. The next implementation slice should not
touch many route families at once.

Recommended next implementation target remains `IF-011` static guard or
`IF-008` Inventory GRN draft cleanup, because both can be scoped without
rewriting the whole route migration.

## IF-011 Implementation - 2026-05-24

Added `scripts/check-ui-contract.mjs` and wired it into root `pnpm lint` through
`pnpm lint:ui-contract`.

Guard behavior:

- Uses per-file baseline counts for current violations.
- Fails if legacy `matu-*` / `matu-surface` / `font-matu-body` usage spreads.
- Fails if locked heading-scale violations spread.
- Fails if banned icon-size classes spread.
- Fails if raw button/touch height classes spread.
- Initially allowed the generated `packages/ui/src/styles/matu-tokens.css`
  artifact because the guard was about app/runtime usage, not token generation
  output. IF-001 later removed that artifact and tightened legacy checks to
  zero runtime hits.

Verification:

- `pnpm lint:ui-contract`: pass.
- `pnpm lint`: pass. Existing `i18n/no-inline-vietnamese` warnings remain
  warnings, not errors.

Status:

- `IF-011`: closed locally.
- Next scoped implementation target: `IF-008` Inventory GRN server-side draft
  cleanup, or `IF-001` legacy kitchen-sink/matu-surface retirement if the owner
  wants design-system debt first.

## IF-008 Implementation - 2026-05-24

Finished the scoped Inventory GRN draft cleanup.

Changes:

- Replaced the legacy `mobile-draft.ts` helper with `grn-draft.ts` so shared
  draft types/helpers no longer imply browser/mobile storage ownership.
- Removed the unused `userKey` prop from the GRN create client.
- Kept line persistence on explicit `saveLine`; submit now only navigates to the
  GRN review surface because draft lines are already server-side.
- Removed `startGrnFromPo`, which previously encoded action errors into the URL.
- Added `GrnFromPoList` as the PO-start client component so create-from-PO
  failures surface through Sonner toast instead of query-param flash.
- Confirmed Inventory GRN/drafts no longer reference `mobile-draft`,
  `startGrnFromPo`, `error=${encodeURIComponent(...)}`, or URL error
  `searchParams`.

Verification:

- `pnpm typecheck`: pass.
- `pnpm lint:ui-contract`: pass.
- `pnpm lint`: pass. Existing `i18n/no-inline-vietnamese` warnings remain
  warnings, not errors.
- `pnpm build`: pass.
- `git diff --check` for touched Inventory files: pass.

Status:

- `IF-008`: closed locally.
- Remaining Interface work should move to either rendered Inventory QA
  (`IF-007`) or legacy design-system debt (`IF-001`), depending on whether the
  next slice should validate behavior or reduce visual drift.

## IF-001 Implementation - 2026-05-24

Retired the legacy Inventory pilot visual layer from runtime app UI.

Local 4-role synthesis:

- PM: keep scope to design-system debt only; do not redesign Inventory routes in
  this slice.
- BA: removing `/admin/kitchen-sink` is acceptable because it was an audit-only
  legacy baseline, not an operator workflow.
- Senior Dev: remove the runtime imports/hooks first, then tighten guardrails so
  the legacy layer cannot return silently.
- QA/QC: verify with static search, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build`; rendered QA is not required because the route is removed rather
  than visually redesigned.

Changes:

- Deleted legacy `/admin/kitchen-sink` route.
- Deleted `apps/web/app/components/matu-surface.tsx`.
- Removed Be Vietnam Pro / `font-matu-body` loading from `apps/web/app/layout.tsx`.
- Removed generated `matu-tokens.css` import and deleted the generated artifact.
- Deleted the legacy `packages/design-tokens` token source and generator script.
- Removed root `tokens:build` / `tokens:check` scripts and the stale lockfile
  importer.
- Tightened `scripts/check-ui-contract.mjs` so the legacy pilot layer has no
  runtime allowlist.
- Updated UI docs/regressions to describe the layer as retired, not merely
  quarantined.

Verification:

- `pnpm clean:web`: cleared stale Next generated route types after deleting
  `/admin/kitchen-sink`.
- Static search for legacy runtime terms now has no app/package hits outside
  documentation and the guard script.
- `pnpm typecheck`: pass.
- `pnpm lint:ui-contract`: pass.
- `pnpm lint`: pass. Existing `i18n/no-inline-vietnamese` warnings remain
  warnings, not errors.
- `pnpm build`: pass. Build route list no longer includes
  `/admin/kitchen-sink`.
- `git diff --check` for touched files: pass.

Status:

- `IF-001`: closed locally.

## IF-009 Closure Evidence - 2026-05-24

Closed the Finance Basic landing/nav stale task with rendered QA and restored
the route-group `/finance/page.tsx` landing file that had gone missing during
the unstaged App Router move.

Scope:

- Verify `/finance` against the active `docs/modules/finance.md` contract.
- Keep Finance full / Accounting Advanced routes available in code but out of
  the default pilot landing.
- Do not add new KPIs or accounting workflows.

Verification:

- Browser plugin unavailable in this session; used Playwright fallback.
- Driver: Playwright Chromium against `http://localhost:3000`.
- Evidence:
  `/tmp/comtammatu-finance-if009-2026-05-24T04-07-31-299Z/summary.json`.
- Desktop owner viewport `1440x960`: pass.
- Mobile owner viewport `390x844`: pass.
- Required landing content present: `Tài chính cơ bản`, `Doanh thu`,
  `Giá trị tồn kho`, `Chi vận hành`, `Lợi nhuận gộp`, `Tổng quan`.
- Advanced accounting labels absent from the landing/nav first screen:
  `Hệ thống tài khoản`, `Sổ nhật ký`, `Quy tắc hạch toán`,
  `Báo cáo tài chính`, `Kỳ kế toán`, `Nhật ký kiểm toán`.
- Interaction proof: `Xem doanh thu` navigates to `/finance/revenue`.
- Console health: only the existing Supabase `getSession()` warning appeared.

Status:

- `IF-009`: closed locally.

## IF-010 Implementation - 2026-05-24

Closed the client persistence classification task and added an automated guard
so workflow/scope storage cannot silently return.

Local 4-role synthesis:

- PM: keep scope to browser persistence only; do not redesign route surfaces.
- BA: user preference storage is acceptable for theme, and install-hint
  dismissal is acceptable for POS PWA chrome; branch scope and workflow drafts
  are not acceptable in browser storage.
- Senior Dev: use a small allowlist script wired into the existing lint chain.
- QA/QC: verify the static scan, ensure Inventory storage hits are comments
  documenting server/URL state, then run the normal repo gates.

Changes:

- Added `scripts/check-client-storage.mjs`.
- Wired `pnpm lint:client-storage` into root `pnpm lint`.
- Current allowlist:
  - `packages/ui/src/components/theme-provider.tsx`: theme preference.
  - `packages/ui/src/components/theme-script.tsx`: pre-hydration theme
    preference.
  - `apps/web/app/(protected)/br/[branchId]/pos/_components/pwa/pos-pwa-toolbar.tsx`:
    POS PWA install-hint dismissal.
- `sessionStorage` has no runtime hits.
- Inventory hits are comments confirming server-side drafts and URL-only branch
  scope; no Inventory runtime browser-storage access remains.

Verification:

- `node scripts/check-client-storage.mjs`: pass.

Status:

- `IF-010`: closed locally.

## IF-003 Implementation - 2026-05-24

Closed the locked heading-scale violations.

Local 4-role synthesis:

- PM: keep scope to typography rhythm only; do not redesign POS, KDS, or
  Inventory detail surfaces.
- BA: table numbers, KDS ticket numbers, and monetary totals are operational
  data, not page headings; they may use mono/tabular emphasis but not
  forbidden heading scale or `font-black`.
- Senior Dev: replace the six runtime hits and remove the old heading-scale
  allowlist from `scripts/check-ui-contract.mjs`.
- QA/QC: verify static scan returns zero; smoke POS/KDS because both frontline
  surfaces were touched.

Changes:

- Inventory detail totals now use `font-mono text-xl font-semibold
  tabular-nums` instead of `font-black`.
- KDS focus ticket number keeps the allowed numeric echo role:
  `text-3xl font-semibold tabular-nums`, without `md:text-4xl`.
- POS table number keeps `text-3xl font-semibold tabular-nums`, without
  `font-black` or responsive `text-4xl/text-5xl/text-6xl`.
- `scripts/check-ui-contract.mjs` heading-scale allowlist is now empty.

Verification:

- `rg -n "\\b(text-4xl|text-5xl|font-black)\\b" apps/web/app packages`: zero
  runtime hits.
- `node scripts/check-ui-contract.mjs`: pass.
- Targeted ESLint on the six touched TSX files: pass with existing
  `i18n/no-inline-vietnamese` warnings only.
- Browser plugin unavailable in this session; used Playwright fallback.
- Rendered evidence:
  `/tmp/comtammatu-if003-heading-2026-05-24T04-17-21-228Z/summary.json`.
- POS desktop, KDS desktop, and KDS mobile passed the script checks.
- POS mobile screenshot was inspected manually and rendered correctly; the
  script marked it false only because the text needle expected `Bàn` while the
  UI renders uppercase `BÀN`.

Status:

- `IF-003`: closed locally.

## IF-004 Implementation - 2026-05-24

Closed the icon/media sizing violations.

Local 4-role synthesis:

- PM: keep scope to icon rhythm only; do not redesign POS, menu management, or
  upload flows.
- BA: distinguish icon glyphs from real media thumbnails. Food photos,
  feedback images, and file previews keep thumbnail sizing; action buttons and
  placeholder glyphs must follow the UI primitive/icon scale.
- Senior Dev: remove every `size-7/9/11` app-surface hit, reduce free-style
  `size-14/16` glyphs, and keep only explicit media thumbnail carve-outs in
  `scripts/check-ui-contract.mjs`.
- QA/QC: verify static scan, run targeted ESLint, then smoke the touched POS
  and Menu surfaces because action target sizing changed.

Changes:

- POS icon-only touch actions now use `Button size="touch"` plus width/padding
  constraints instead of raw `size-11` or `size-9` overrides.
- Menu management icon buttons now rely on the `Button size="icon"` primitive
  and no longer override to `size-9`.
- POS empty/status/menu placeholder glyphs were reduced from oversized icon
  classes to the allowed role scale.
- Brand default mark sizing no longer uses `size-9`; the large `size-14` brand
  mark remains a brand asset exception.
- `scripts/check-ui-contract.mjs` icon-size allowlist now contains only current
  image/file thumbnail exceptions.

Verification:

- `rg -n "\\bsize-(7|9|11)\\b" apps/web/app`: zero hits.
- `rg -n "\\bsize-(14|16)\\b" apps/web/app`: only brand asset sizing and
  media thumbnail/placeholder hits remain.
- `node scripts/check-ui-contract.mjs`: pass.
- Targeted ESLint on touched TSX files: pass with existing
  `i18n/no-inline-vietnamese` warnings only.
- Browser plugin unavailable in this session; used Playwright fallback.
- Rendered evidence:
  `/tmp/comtammatu-if004-icon-2026-05-24T04-51-35-819Z/summary.json`.
- POS desktop and mobile passed after selecting table 1 and opening the menu
  surface.
- Menu desktop and mobile passed after opening a row action menu. Console
  warnings were limited to the existing Supabase `getSession()` warning.
- `pnpm typecheck && pnpm lint && pnpm build`: pass. Lint remains at the
  existing `1316 warnings / 0 errors` i18n baseline.

Status:

- `IF-004`: closed locally.

## IF-005 Implementation - 2026-05-24

Closed the button/touch-height violations for real actions.

Local 4-role synthesis:

- PM: keep scope to primitive sizing. Do not redesign POS/KDS/Inventory
  information architecture while route migration remains unstaged.
- BA: action controls need stable touch targets; non-action surfaces such as
  skeleton rows, input groups, number-pad display keys, header bars, and brand
  lockups are not action buttons and may keep layout height when reviewed.
- Senior Dev: move real `<Button>` and raw action controls from `h-*` /
  `min-h-*` overrides to `Button size="touch"` or `touch-lg`; replace raw tab
  button minimums with padding-based sizing where no Button primitive is used.
- QA/QC: verify the UI contract guard, targeted ESLint, rendered POS/KDS/Menu
  smoke, and the full `pnpm typecheck && pnpm lint && pnpm build` gate.

Changes:

- POS drawer/footer/action-bar buttons now use `size="touch"` or
  `size="touch-lg"` instead of raw `h-10/11/12/14` or `min-h-*` overrides.
- POS order history, multi-order picker, archived-orders trigger, payment
  method picker, append-draft controls, and item action sheet now take height
  from the Button primitive.
- KDS station toggle action pills no longer use raw `min-h-10`; they use
  padding-based sizing.
- Inventory purchase-order footer actions and transfer receive CTA now use
  primitive touch sizing; mobile inventory link rows use padding instead of
  raw `min-h-14`.
- `scripts/check-ui-contract.mjs` button-height allowlist is narrowed to the
  remaining reviewed non-button containers, input groups, skeletons, and brand
  layout cases.

Verification:

- `node scripts/check-ui-contract.mjs`: pass.
- Static scan after refactor shows no remaining real action buttons in the
  reviewed IF-005 set using forbidden fixed/touch height overrides; remaining
  hits are reviewed layout/input/skeleton/brand cases.
- Rendered Playwright fallback QA on local dev server:
  `/tmp/comtammatu-if005-touch-2026-05-24T06-36-52-927Z/summary.json`.
  POS desktop, POS mobile, KDS desktop, KDS mobile, and Inventory mobile were
  nonblank, had no Next.js/app error overlay, and completed a visible
  interaction.
- Rendered console: POS and KDS were clean; Inventory mobile only emitted the
  existing Supabase `getSession()` warning.
- Full repository gate: `pnpm typecheck && pnpm lint && pnpm build` passed.
  Lint completed with existing i18n warnings and zero errors.

Status:

- `IF-005`: closed.

## IF-006 Implementation - 2026-05-24

Closed the radius rhythm drift for the touched POS/KDS route family.

Local 4-role synthesis:

- PM: keep the slice narrow. IF-006 is not a full-app visual cleanup while the
  route-group migration is still unstaged.
- BA: the contract only forbids no-suffix `rounded` and `rounded-sm/xl/2xl/3xl/4xl`.
  Valid radius tokens remain `rounded-md`, `rounded-lg`, `rounded-full`, and
  `rounded-none`.
- Senior Dev: replace the POS drawer pseudo-surface `sm:before:rounded-xl` with
  `sm:before:rounded-lg`, matching the sheet/drawer outer radius contract.
  Add a guard for banned app-surface radius so remaining non-POS debt cannot
  spread.
- QA/QC: verify POS/KDS route-family static scan returns zero banned-radius
  hits, run the UI contract guard, render-smoke POS, and run the full
  repository gate.

Changes:

- POS mobile sidebar drawer pseudo-surface now uses `sm:before:rounded-lg`
  instead of `sm:before:rounded-xl`.
- `scripts/check-ui-contract.mjs` now includes `radius-scale`, allowlisting the
  current 14 non-POS banned-radius baseline hits as debt.

Verification:

- `node scripts/check-ui-contract.mjs`: pass.
- POS/KDS targeted banned-radius scan: zero hits.
- Full app banned-radius baseline after this slice: 14 hits outside POS/KDS,
  all represented in the guard allowlist.
- Targeted ESLint for `pos-desktop-shell.tsx`: pass.
- Rendered Playwright fallback QA on local dev server:
  `/tmp/comtammatu-if006-radius-2026-05-24T07-17-44-376Z/summary.json`.
  POS desktop and POS mobile were nonblank, had no Next.js/app error overlay,
  completed a visible item-customizer interaction, and had clean console output.
- Full repository gate: `pnpm typecheck && pnpm lint` passed; the first
  chained build attempt was blocked by an already-running `next build` lock, then
  `pnpm build` passed after that process completed. Lint completed with existing
  i18n warnings and zero errors.

Status:

- `IF-006`: closed.

## IF-002 Stage A/B - 2026-05-24

Stabilized the first safe splits of the App Router route-group migration.

Local 4-role synthesis:

- PM: close the risk that Interface cleanup is hidden inside a giant unstaged
  move; do not claim the whole route migration is complete yet.
- BA: no-counterpart deletions are acceptable only when they are intentional
  cleanup classes with replacements or retired surfaces.
- Senior Dev: keep byte-identical route moves as their own staged bucket and
  stage only the intentional deletion bucket. Leave changed counterparts split
  by route family for review.
- QA/QC: make the audit repeatable, verify staged shape, and keep the remaining
  changed counterpart set explicit.

Changes:

- `scripts/audit-route-group-migration.mjs` now reports staged route moves,
  byte-identical versus changed staged moves, untracked route files, and buckets
  changed counterparts by route family.
- Staged the `17` intentional no-counterpart deletions:
  legacy `docs/llm-wiki/*`, legacy `matu-surface`, legacy generated design
  token package/files, legacy `admin/kitchen-sink`, and replaced Inventory
  browser-draft helper.
- Reviewed and staged the smallest changed-counterpart buckets:
  employee (`3`) and public/auth/payment return (`4`).
- Current staged split is `385` app route moves (`378` byte-identical and `7`
  reviewed changed moves) plus `17` intentional deletions.
- Current audit still shows `139` changed counterparts and `157` total
  untracked route files; the extra route files are not part of a deleted
  old-path counterpart pair and need separate review later.

Remaining route-family review queue:

| Route family | Changed counterparts |
| --- | ---: |
| admin | 15 |
| branch/POS/KDS/settings | 52 |
| finance | 15 |
| HR | 8 |
| inventory | 40 |
| menu | 5 |
| orders | 4 |

Verification:

- `node scripts/audit-route-group-migration.mjs`: pass; no no-counterpart
  deletes remain unstaged.
- `git diff --cached --name-status`: staged split contains `385` app route
  moves and `17` deletions.
- Targeted ESLint for the `7` reviewed changed-route files: pass with existing
  i18n warnings and zero errors.

Status:

- `IF-002`: partially split; still open until the `139` changed counterparts are
  reviewed/staged by route family and the full repository gate passes.

## IF-002 Stage C - 2026-05-24

Reviewed and staged the `orders` changed-counterpart bucket as a small
route-family slice.

Local 4-role synthesis:

- PM: keep the slice to `orders` only because it is the smallest remaining
  changed-counterpart bucket and reduces route migration risk without widening
  Interface scope.
- BA: preserve order/refund behavior; only accept changes that are route-group
  import fixes or shared adapter alignment.
- Senior Dev: compare each new `(protected)/orders` file against the old
  `HEAD:apps/web/app/orders/*` source, then stage old delete + new file together
  so Git records renames.
- QA/QC: rerun route migration audit, cached diff check, and targeted ESLint for
  the staged `orders` files; defer full `typecheck/lint/build` until IF-002 is
  ready to close.

Reviewed changes:

- `orders/layout.tsx`: updates `loadAuthState` import to the app absolute alias
  after moving into `(protected)`.
- `orders/orders-client.tsx` and `orders/refunds-client.tsx`: point table empty
  states to the shared `@/components/table-empty-state-row` adapter; the old
  admin path now re-exports that shared component.
- `orders/page.tsx`: nests `TabsContent` under `AppPageTabs`, matching the
  current URL-tabs API instead of rendering tab panels outside the controlled
  tabs root.

Audit after Stage C:

- `389` staged app route moves.
- `378` byte-identical staged route moves.
- `11` staged reviewed changed-route moves.
- `17` intentional no-counterpart deletions.
- `135` changed counterparts remain.
- Remaining route-family queue: admin (`15`), branch/POS/KDS/settings (`52`),
  finance (`15`), HR (`8`), inventory (`40`), menu (`5`).

Verification:

- `node scripts/audit-route-group-migration.mjs`: pass; `orders` no longer
  appears in `changedByRouteFamily`.
- `git diff --cached --check`: pass.
- Targeted ESLint for the `4` reviewed `orders` files: pass with `0` errors
  and existing inline-Vietnamese warnings.

## IF-002 Stage D - 2026-05-24

Reviewed and staged the `menu` changed-counterpart bucket.

Local 4-role synthesis:

- PM: keep this to the next smallest bucket (`menu`, `5` files) before touching
  larger admin/branch/inventory groups.
- BA: menu-management behavior must stay intact; comment-path updates, import
  realignment, and primitive-sizing cleanup are acceptable.
- Senior Dev: stage old delete + new `(protected)/menu` file together after
  comparing against `HEAD:apps/web/app/menu/*`.
- QA/QC: audit must remove `menu` from `changedByRouteFamily`; run cached diff
  whitespace check and targeted ESLint for the staged files.

Reviewed changes:

- `menu/actions.ts`: updates internal comments that point at the moved POS menu
  action path.
- `menu/category-table.tsx` and `menu/item-table.tsx`: import
  `TableEmptyStateRow` from the shared app component adapter.
- `menu/item-detail-dialog.tsx`: imports `EmptyStatePanel` from the shared app
  component adapter.
- `menu/category-table.tsx`, `menu/item-table.tsx`, and
  `menu/item-detail-dialog.tsx`: remove raw `size-9` overrides from icon
  buttons so they use the Button primitive sizing.
- `menu/layout.tsx`: updates `loadAuthState` import to the app absolute alias
  after moving into `(protected)`.

Audit after Stage D:

- `394` staged app route moves.
- `378` byte-identical staged route moves.
- `16` staged reviewed changed-route moves.
- `17` intentional no-counterpart deletions.
- `130` changed counterparts remain.
- Remaining route-family queue: admin (`15`), branch/POS/KDS/settings (`52`),
  finance (`15`), HR (`8`), inventory (`40`).

Verification:

- `node scripts/audit-route-group-migration.mjs`: pass; `menu` no longer
  appears in `changedByRouteFamily`.
- `git diff --cached --check`: pass.
- Targeted ESLint for the `5` reviewed `menu` files: pass with `0` errors and
  existing inline-Vietnamese warnings.

## IF-002 Stage E - 2026-05-24

Reviewed and staged the `HR` changed-counterpart bucket.

Local 4-role synthesis:

- PM: take the next smallest remaining bucket (`HR`, `8` files) and avoid
  mixing it with finance, admin, inventory, or branch route families.
- BA: preserve HR/payroll behavior except for the already-tracked payroll
  permission hardening; route-group import fixes and shared adapter alignment
  are acceptable.
- Senior Dev: compare each new `(protected)/hr` file against the old
  `HEAD:apps/web/app/hr/*` source and stage old delete + new file together.
- QA/QC: confirm `HR` disappears from the route audit, run cached diff
  whitespace check, and run targeted ESLint for the staged HR files.

Reviewed changes:

- `hr/actions.ts`, `hr/shift-assignment-actions.ts`, `hr/layout.tsx`: update
  auth/branch-scope imports to app absolute aliases after moving into
  `(protected)`.
- `hr/employee-table.tsx` and `hr/shifts-table.tsx`: import
  `TableEmptyStateRow` from the shared app component adapter.
- `hr/payroll/[periodId]/page.tsx`: imports audit history and audit helpers from
  shared app-level adapters instead of old route-family paths.
- `hr/components/hr-shell.tsx`: narrows the HR nav to the actual available HR
  and payroll surfaces.
- `hr/payroll-actions.ts`: preserves the previously tracked hardening that
  gates calculate/fetch actions on `finance:payroll_calculate` and approve/paid
  transitions on `finance:payroll_approve`.

Audit after Stage E:

- `402` staged app route moves.
- `378` byte-identical staged route moves.
- `24` staged reviewed changed-route moves.
- `17` intentional no-counterpart deletions.
- `122` changed counterparts remain.
- Remaining route-family queue: admin (`15`), branch/POS/KDS/settings (`52`),
  finance (`15`), inventory (`40`).

Verification:

- `node scripts/audit-route-group-migration.mjs`: pass; `HR` no longer appears
  in `changedByRouteFamily`.
- `git diff --cached --check`: pass.
- Targeted ESLint for the `8` reviewed `HR` files: pass with `0` errors and
  existing inline-Vietnamese warnings.

## IF-002 Stage F - 2026-05-24

Reviewed and staged the `finance` changed-counterpart bucket plus direct
support files required by the staged Finance Basic landing.

Local 4-role synthesis:

- PM: keep Finance as one route-family slice; do not mix it with admin,
  inventory, or branch/POS/KDS changes.
- BA: Finance Basic is the accepted pilot contract: first screen should focus
  on owner-level cash collected, inventory value, operating expense, and gross
  profit; advanced accounting remains available but must not define the pilot
  default.
- Senior Dev: compare each moved Finance counterpart against
  `HEAD:apps/web/app/finance/*`; include support files only when the staged
  Finance page would otherwise import an unstaged file.
- QA/QC: run route audit, cached diff whitespace check, targeted ESLint, and
  `@comtammatu/web` typecheck because this slice includes new support code.

Reviewed changes:

- `finance/actions.ts`, `archive-actions.ts`, `reconcile-invoice-actions.ts`,
  `replace-invoice-actions.ts`, `summary-invoice-actions.ts`, and
  `layout.tsx`: update auth/audit/branch-scope imports to app absolute aliases
  after moving into `(protected)`.
- `finance/invoice-list.tsx`: imports `TableEmptyStateRow` from the shared app
  component adapter.
- `finance/accounting-actions.ts`: types chart-of-account updates with
  `TablesUpdate<"chart_of_accounts">` and writes `account_name`.
- `finance/components/filter-bar.tsx`: moves range selection into shadcn
  `Select`, adds route-specific range subsets, syncs custom date draft state,
  and uses primitive card sizing.
- `finance/components/finance-shell.tsx`: narrows pilot navigation to Finance
  Basic surfaces.
- `finance/page.tsx`: replaces the old `/finance -> /finance/revenue` redirect
  with the Finance Basic owner cockpit. Git records this as delete/add rather
  than a rename because the content was rewritten.
- `finance/revenue/page.tsx` and `revenue/revenue-client.tsx`: gate cashier
  detail to the same range window as hourly detail, move the filter bar to the
  top, reduce pilot KPI clutter, and use named card content scroll slots.
- `finance/use-finance-realtime-refresh.ts`: slows automatic refresh cadence and
  adds a minimum refresh interval.
- Added direct support files for the staged Finance Basic page:
  `apps/web/app/(protected)/finance/_lib/finance-cockpit.ts`,
  `apps/web/app/_actions/inventory.ts`, and `apps/web/lib/messages/finance.ts`.

Audit after Stage F:

- `416` staged app route moves.
- `378` byte-identical staged route moves.
- `38` staged reviewed changed-route moves.
- `17` intentional no-counterpart deletions.
- `107` changed counterparts remain.
- Remaining route-family queue: admin (`15`), branch/POS/KDS/settings (`52`),
  inventory (`40`).

Verification:

- `node scripts/audit-route-group-migration.mjs`: pass; `finance` no longer
  appears in `changedByRouteFamily`.
- `git diff --cached --check`: pass.
- Targeted ESLint for the `15` reviewed Finance counterparts plus `3` support
  files: pass with `0` errors and existing inline-Vietnamese warnings.
- `pnpm --filter @comtammatu/web typecheck`: pass.

## IF-002 Stage G - 2026-05-24

Reviewed and staged the `admin` changed-counterpart bucket plus direct shared
adapters required by the staged admin imports.

Local 4-role synthesis:

- PM: take the remaining `admin` bucket (`15` files) as one route-family slice;
  keep branch/POS/KDS and inventory out of this stage.
- BA: preserve admin settings/report behavior while allowing route-group import
  fixes and shared app-level adapters for audit, branch scope, and reusable
  empty-state/report components.
- Senior Dev: compare each moved admin counterpart against
  `HEAD:apps/web/app/admin/*`; include app-level adapters only when the staged
  admin route would otherwise depend on an unstaged file.
- QA/QC: confirm `admin` disappears from the route audit, run cached diff
  whitespace check, targeted ESLint, and `@comtammatu/web` typecheck because
  this slice adds shared app-level files.

Reviewed changes:

- `admin/_lib/audit.ts` and `admin/_lib/branch-scope.ts`: now re-export the
  shared app-level helpers from `@/_lib/audit` and `@/_lib/branch-scope`.
- Added shared app adapters:
  `apps/web/app/_lib/audit.ts`,
  `apps/web/app/_lib/branch-scope.ts`,
  `apps/web/app/components/empty-state-panel.tsx`,
  `apps/web/app/components/inventory-value-panel.tsx`, and
  `apps/web/app/components/period-close-card.tsx`.
- `admin/accounting/periods/*`, `admin/layout.tsx`, `admin/settings/layout.tsx`,
  and report pages now import from app-level auth/component/action aliases after
  the `(protected)` move.
- `admin/settings/branches/attendance-actions.ts`: removes the obsolete raw
  `Record<string, unknown>` update cast now that generated types cover branch
  coordinates.
- `admin/settings/kds/actions.ts`: types the station update payload with
  `TablesUpdate<"kds_stations">`.
- `admin/settings/payments/actions.ts` and `admin/settings/tables/actions.ts`:
  update internal comments to the `(protected)/br/[branchId]` route paths.

Audit after Stage G:

- `430` staged app route moves.
- `378` byte-identical staged route moves.
- `52` staged reviewed changed-route moves.
- `17` intentional no-counterpart deletions.
- `92` changed counterparts remain.
- Remaining route-family queue: branch/POS/KDS/settings (`52`), inventory
  (`40`).

Verification:

- `node scripts/audit-route-group-migration.mjs`: pass; `admin` no longer
  appears in `changedByRouteFamily`.
- `git diff --cached --check`: pass.
- Targeted ESLint for the `15` reviewed admin counterparts plus `5` support
  files: pass with `0` errors and existing inline-Vietnamese warnings.
- `pnpm --filter @comtammatu/web typecheck`: pass.

## IF-002 Stage H - 2026-05-24

Reviewed and staged the `inventory` changed-counterpart bucket plus direct
support files required by the staged Inventory route migration.

Local 4-role synthesis:

- PM: take `inventory` (`40` files) before the larger branch/POS/KDS bucket, and
  keep the remaining branch route family untouched.
- BA: preserve Inventory runtime behavior while keeping the already accepted
  Sprint 6 GRN draft refactor: server-side draft is source of truth, and
  PO-to-GRN creation uses toast feedback instead of URL flash.
- Senior Dev: compare moved counterparts against `HEAD:apps/web/app/inventory/*`;
  include only support files needed by staged imports/extractions.
- QA/QC: confirm `inventory` disappears from the route audit, run cached diff
  whitespace check, targeted ESLint over staged Inventory files, and
  `@comtammatu/web` typecheck.

Reviewed changes:

- Audit-history consumers now import `AuditLogRow` / `fetchEntityAuditLogs` from
  shared `@/_lib/audit` instead of the old admin route-private helper.
- `inventory/_components/table-empty-state-row.tsx` and
  `inventory/_components/interactive-card.tsx` now delegate to shared app-level
  adapters.
- Added `apps/web/app/components/data-table/interactive-card.tsx` as the shared
  interactive-card adapter used by Inventory.
- `mobile-draft.ts` is replaced by `inventory/_lib/grn-draft.ts`; the helper is
  pure type/total logic and safe for client/server use.
- GRN new flow keeps server-side draft state as source of truth, removes the
  old `startGrnFromPo` redirect/form-action wrapper, extracts
  `GrnFromPoList`, and shows PO-to-GRN failures via toast.
- Inventory shell/dashboard add a lighter owner/area-manager oversight path
  while branch operational flows keep their existing action-first model.
- Touched Inventory lists/details continue the design-system cleanup already in
  progress: shared `CardContent flush`, primitive button touch sizing, dialog
  description, and app-level route aliases.
- `stocktake/new/page.tsx` preserves the requested branch query in login
  `returnTo`.

Audit after Stage H:

- `470` staged app route moves.
- `379` byte-identical staged route moves.
- `91` staged reviewed changed-route moves.
- `52` changed counterparts remain.
- Remaining route-family queue: branch/POS/KDS/settings (`52`).

Verification:

- `node scripts/audit-route-group-migration.mjs`: pass; `inventory` no longer
  appears in `changedByRouteFamily`.
- `git diff --cached --check`: pass.
- Targeted ESLint for staged Inventory/support files: pass with `0` errors and
  existing inline-Vietnamese warnings (`435` warnings).
- `pnpm --filter @comtammatu/web typecheck`: pass.

## IF-002 Stage I - 2026-05-24

Reconciled the final branch/POS/KDS/settings bucket after `HEAD` advanced to
`5c65d71d` (`chore: sync cloud migrations and pilot hardening`).

Local 4-role synthesis:

- PM: finish IF-002 by verifying the route-group migration is no longer present
  as dirty worktree state and that runtime routes still build.
- BA: branch operational URLs must remain stable (`/br/[branchId]/pos`,
  `/br/[branchId]/kds`, and branch settings) even though their source files now
  live under `apps/web/app/(protected)/br`.
- Senior Dev: confirm legacy `apps/web/app/br` source paths are gone, protected
  branch paths exist, and stale worklog/todo counts are corrected.
- QA/QC: route audit must be clean; full repo completion gate must pass before
  closing IF-002.

Reconciliation evidence:

- `git status --short --branch`: clean on `codex/continue-ts`.
- `node scripts/audit-route-group-migration.mjs`: `0` staged route moves, `0`
  unstaged deleted/untracked route counterparts, `0` changed counterparts, and
  `0` no-counterpart deletes.
- `apps/web/app/(protected)/br` exists; legacy `apps/web/app/br` is absent.
- Next build route table still exposes stable URLs such as `/br/[branchId]/pos`,
  `/br/[branchId]/kds`, `/br/[branchId]/settings/*`, and
  `/br/[branchId]/runner`.

Verification:

- `pnpm typecheck`: pass.
- `pnpm lint`: pass with existing inline-Vietnamese warnings (`1331` warnings,
  `0` errors); copy/import/UI/client-storage guards passed.
- `pnpm build`: pass; Next generated `86` static pages and Serwist precached
  `177` URLs.

Decision: `IF-002` is closed. Broad Interface runtime edits can now proceed from
a clean route tree instead of a dirty route migration split.
