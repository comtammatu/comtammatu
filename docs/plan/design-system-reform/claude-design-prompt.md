# Master prompt — Cơm Tấm Má Tư design-system reform

> **⚠️ SNAPSHOT (master prompt, hướng-tới) — Reconciled-through `0fe2761b` (2026-06-22).** Prompt thực thi reform, không phải trạng thái hệ thống. Nền + quyết định bền: `DESIGN.md` (root) + `decisions.md` D042/D044 — verify vào đó trước.

> **Cách dùng (tiếng Việt):** copy nguyên khối ``` PROMPT ``` bên dưới và dán cho
> Claude Design (giai đoạn mockup) rồi Claude Code (giai đoạn code). Prompt phân 2
> giai đoạn với 1 **cổng dừng** ở giữa — Claude PHẢI dừng cho owner duyệt mockup
> trước khi đụng runtime. Nền tảng là `DESIGN.md` ở root; quyết định nền là D044.

---

```PROMPT
ROLE
You are the design + front-end lead executing an owner-approved design-system reform
of "Cơm Tấm Má Tư" — an operational, single-tenant multi-branch Vietnamese restaurant
POS/ERP (Next.js App Router + Tailwind v4 + shadcn/radix-lyra + Supabase, internal UI
copy in Vietnamese, runtime forced light mode).

THE FOUNDATION IS DESIGN.md (repo root). Read it first and treat it as authoritative
for tokens, the surface/depth ladder, typography, motion, components, and intent. Also
read: docs/spec/design-system.md (enforcement layer), packages/ui/src/styles/globals.css
(current runtime tokens), apps/web/app/components/surface.tsx (app adapters),
docs/plan/decisions.md D044 (the decision of record).

DIRECTION (owner-locked): UPGRADE the existing Má Tư identity — terracotta primary,
rice-cream (kem gạo) background, deep-navy (xanh đậm) ink, rice-yellow (vàng gạo)
accent, Geist + Geist Mono — making it DEEPER and MORE CONSISTENT. This is NOT a
reinvention. Scope: all surfaces (POS, KDS/Runner, Admin, Inventory, Employee).

NON-NEGOTIABLE CONSTRAINTS (all from DESIGN.md — do not violate any):
1. OKLCH-only tokens; semantic tokens only (no hex/rgb/hsl, no raw Tailwind palette).
   Two named raw exceptions only: POS food-photo gradient + pos-text-overlay.
2. Additive, never rename. Base token names AND values stay. New need = new token or
   new cva variant/prop with a back-compat default. The ONLY existing default outputs
   that may change are the four named defect fixes (Button.default desktop hover;
   Input/SelectTrigger focus-ring opacity ring/30→/55; Dialog/Sheet/Drawer/AlertDialog
   title → font-heading text-base font-semibold; modal scrim bg-black/80 →
   bg-foreground/70).
3. Border-first depth. Separate surfaces with background-tint then border-tint; shadow
   ONLY for surfaces that float over scrolling content. Selected state = ring+border+bg,
   NEVER shadow. No new shadow tokens.
4. --card stays oklch(1 0 0) pure white. Depth comes from surface-inset + border-raised.
5. Radius = 4 tiers only (md/lg/full/none); child nests down one tier.
6. Single font roster Geist + Geist Mono; no third font; no font-black; no text-4xl/5xl
   in app; no arbitrary text-[..]/leading-[..]; no viewport-width type.
7. Motion functional-only: durations 150/300 (+500 Runner idle only), no library, no
   @keyframes outside globals.css, explicit transition property lists (no transition-all),
   press by tier (translate ≤36px / scale-0.99 rows / scale-0.97 tiles).
8. Status text uses {tone}-ink on {tone}-soft (AA-guaranteed); base {tone} is fill/border
   only; never text-warning on white; color is never the sole status signal (pair with
   label/dot/border tier).
9. Touch floors min-h-12 / touch-lg min-h-14 / icon-touch size-12 on POS/KDS/Employee;
   Admin dense-row exception floor h-9.
10. Every new token defines BOTH :root and .dark (even though runtime is light).
11. One open decision to SURFACE, not assume: re-hueing --info from navy to cool blue.
    Default = keep info navy + use the additive info-accent token. Flag it for the owner.

================================================================================
PHASE 1 — MOCKUPS FOR OWNER REVIEW   (no runtime/code changes; STOP at the gate)
================================================================================
Produce visual mockups (static HTML/preview is fine) that let the owner SEE the upgrade
before any code is touched. Use the real OKLCH tokens, real Vietnamese copy, and the
real component anatomy from DESIGN.md.

Deliver, in this order:
  A. FOUNDATIONS BOARD — the elevated color ramps + soft/ink pairs, the surface ladder
     L0→L6 shown as stacked panels, the type scale (every role row), the radius tiers,
     and a component gallery (Button all variants×states, Badge/StatusBadge with dot,
     Card default/raised/inset, Input states, Table comfortable/compact, Tabs, Dialog,
     KpiCard hero, OperationalTile selected). Show the full 8-state matrix on Button.
  B. PER-SURFACE MOCKUPS — one screen each, applying the surface ladder + type lifts +
     state matrix + status-as-{ink-on-soft}:
       - POS: menu grid + cart pane + order-list pane + session header + mobile floating
         bar + payment/bill dialog. Show the panes on distinct tiers (menu on
         background, panes on card, recessed rows on surface-inset).
       - KDS/Runner: live ticket board + focus-view card + runner customer display.
       - Admin: list+filter (T1), detail+tabs (T2), a CRUD dialog.
       - Inventory: a dense table + a document line-sheet (PO/GRN) with totals footer.
       - Employee: the mobile task portal (header + bottom-nav + a task list).
  C. For each surface, a 3-bullet rationale citing which audit "flatness/hierarchy" gaps
     it fixes, plus a BEFORE→AFTER note on the top opportunity.
  D. An "OPEN DECISIONS" list — at minimum the --info re-hue (show both options), plus
     any sRGB-gamut risk on success-soft/warning-soft.

Then STOP. Output: the mockups + rationale + open decisions. Do NOT edit globals.css,
primitives, or any runtime file. Wait for explicit owner approval of the mockups.

================================================================================
PHASE 2 — CODE   (only after the owner approves the Phase 1 mockups)
================================================================================
Implement additively, one wave per PR, each PR stating {surface | primitive wave},
primary user job, change type, and primitives used. After EVERY wave:
`pnpm typecheck && pnpm lint && pnpm build` must pass; update the static UI-contract
test alongside; ship every new lint ratchet as a COUNT-DOWN BASELINE (freeze existing
violations, block new) — never a day-one hard fail; keep all six design-system.md §B
sync targets atomic.

Wave order:
  1. TOKENS — add the elevated tokens to globals.css (:root + .dark): surface-inset,
     border-inset, border-raised, border-strong, navy-900, info-accent, chart-grid,
     chart-axis, and the {tone}-soft/{tone}-ink pairs; the --leading-*/--tracking-*/
     --measure-* type block; @theme inline registrations. sRGB-gamut-check every soft
     step; verify every contrast pair with a real tool (AA body, AAA where feasible;
     focus ring ≥3:1). Then sync DESIGN.md YAML to the landed values and TURN ON the
     DESIGN.md↔globals.css drift-guard lint.
  2. PRIMITIVES — Button (hover fix + loading prop + press tiers + focus ring),
     Input/Select (focus-ring fix + size cva, retire form/* h-10 hack), Card/AppSection
     (variant default|raised|inset + tone deepen + accent border), Dialog/Sheet/Drawer/
     AlertDialog (title scale + semantic scrim), Badge/StatusBadge (size cva + dot wired
     to getStatusDotClassName), Table/DataTable (density + severity border), Tabs
     (primary underline), KpiCard (hero), OperationalTile/BoardCard (selected ring, no
     shadow), Spinner/Skeleton/Progress (size).
  3. ADAPTERS — apply the L0→L6 ladder in surface.tsx (AppPage/AppSection panes, inset
     wells, raised panels).
  4. SURFACES — POS (pane tiers, header, cart wells, price→Badge variant), KDS (board
     tiers, focus card), Admin (shell, tables), Inventory (tables, line-sheets, KPI),
     Employee (portal). One route family per PR.
  5. ENFORCEMENT — demote docs/spec/design-system.md to the enforcement layer and point
     it at DESIGN.md; update docs/agent/rules/ui.md "one source of truth" → "token
     values = globals.css, mirrored to DESIGN.md; DESIGN.md = foundation,
     design-system.md = enforcement"; add the AGENTS.md root pointer + Rule-Loading
     line; bless the DESIGN.md path in check-ui-contract.mjs.

GATES & VERIFICATION
- Hard gate: owner approval between Phase 1 and Phase 2. No runtime token change before it.
- Every PR: typecheck + lint + build green; before/after visual diff per surface; contrast
  verified; reduced-motion verified (all states legible from end-state).
- Surface the --info decision explicitly; do not let a re-hue ride in as "additive".
```

---

## Ghi chú vận hành (tiếng Việt)

- **Giai đoạn 1** chạy ở Claude Design / môi trường mockup (HTML/preview). Owner duyệt
  diện mạo trước — đây là điểm an toàn, chưa đụng code.
- **Giai đoạn 2** chạy ở Claude Code trong repo, theo đúng thứ tự wave + cổng kiểm tra
  `pnpm typecheck && pnpm lint && pnpm build`. Mỗi PR 1 route-family / 1 primitive wave.
- Quyết định mở duy nhất cần owner chốt ở review: **có re-hue `--info` sang xanh dương
  không** (mặc định: giữ navy + dùng `info-accent`).
- Khi giai đoạn 2 token wave xong và `globals.css` đã migrate khớp `DESIGN.md`, bật
  drift-guard `DESIGN.md ↔ globals.css` (pattern `lint:rules-mirror`) → SSoT đóng vòng.
