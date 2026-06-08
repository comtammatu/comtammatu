# Current Tasks

> Active tracker for the **Greenfield lean rebuild** (`codex/greenfield-ts`): comtammatu
> CTCP → Hộ Kinh Doanh lean, single app, flat-branch, 4 roles, no stock-deduction.
> The old in-place production track is FROZEN (`supabase/_legacy/`; prod runs until the
> Option-B cutover). Shipped CTCP history + all retired items live in git +
> `tasks/regressions.md` + `tasks/lessons.md` — not duplicated here.

## Program status (2026-06-08)

- **DB:** lean baseline = 58 tables (`supabase/migrations/00000000000000_baseline.sql`),
  replay-from-empty verified. ⚠️ **Cutover is HALF-APPLIED** — table drops done, but
  RPC/GRANT/cron/realtime rewrites + the data-migration are still pending (see roadmap).
- **App:** still the full CTCP app (~724 files), unaligned with the lean DB (~55 files
  query dropped tables; typecheck only green because `database.types.ts` is stale).
  Lean-in-place rebuild not yet started.
- **Audit:** Ultracode multi-agent audit `wf_bd69fcd4-47a` complete — 10 dimensions,
  100 verified findings, 12-priority roadmap.
- **Plan:** `~/.claude/plans/temporal-imagining-lampson.md` (revised P2–P6, lean-in-place).

## Greenfield roadmap (P2–P6)

> Plan: `~/.claude/plans/breezy-churning-knuth.md` (approved 2026-06-08). Lead + Multi-Agent (Dynamic Workflows).
> 1 PR/slice; gates typecheck/lint/build/test; money/auth/schema = T3. Dev DB = **uozwee** (MCP); prod SELECT-only.

**P2.0 — Gỡ HOÀN TOÀN Feedback + Telegram + AI + CRM** ✅ DONE 2026-06-08 (workflow `wf_206b66d5`, review CLEAN; gates typecheck 6/6·lint 0-err·build 2/2·web 117/117; UNCOMMITTED)
- [x] V0a relocate `getCronSecret` → `packages/shared/src/cron/env.ts` (fail-closed) + repoint 4 cron KEEP + move security-headers test
- [x] V0b xoá Feedback (app `/r` + admin/feedback + api/ai + `shared/{feedback,ai}` + `@anthropic-ai/sdk` + bucket feedback-photos + vercel crons) — 58 file deleted, 0 code ref còn lại
- [x] V0c xoá Telegram (`api/cron/telegram-flush` + `shared/telegram` + `getTelegramBotToken` + strip telegram leg → notifications alertChannel = generic/discord/slack)
- [ ] **V0d (follow-up): xoá dead feedback-HOST routing** (`isFeedbackPublicPath`/`resolveHostSurface`/`HostSurface 'feedback'` trong `auth/{index,route-resolution}.ts` + `proxy.ts` + `robots.ts` + `NEXT_PUBLIC_FEEDBACK_HOST` + scope.test host cases) — giờ guard 0 trang, dead → gỡ cho sạch hẳn (đụng proxy/auth, blast nhỏ)
- [ ] **Known issue (pre-existing, không do P2.0): 13 shared test FAIL** — 7 migration-static test (inventory-rpc/network-gate/security-definer/payment-hardening/3 kds-print) đọc `supabase/migrations/*.sql` riêng lẻ đã bị squash vào baseline → repoint đọc baseline.sql hoặc bỏ (gắn V19 drift-linter + V22 CI test)
- [ ] (P2.5/V9) dead `feedbackTokenRateLimit`/`feedbackIpRateLimit` trong `packages/security/src/rate-limit.ts` (0 importer) — dọn khi merge security→shared

**P2 — Cổng boot được (uozwee)**
- [ ] V1 secrets fail-closed (✅ code done; owner rotate Telegram+CRON)
- [ ] V2 auth hook bỏ `profiles.area_id`
- [ ] V3 GRANTs (verify uozwee; auth-hook EXECUTE→`supabase_auth_admin`)
- [ ] V4 lean seed (4 positions, ~40 perm-keys, system_settings)
- [ ] V5 permission-grant path bỏ `permission_audit_log`
- [ ] V6 `cash_entries` RLS policy + grant + amount(15,2)
- [ ] V7 `route_order_to_kds` + print producer bỏ 3 bảng printer
- [ ] V8 10→4 roles + flat-branch
- [ ] V9 packages 4→3 (security→shared)

**P2.5 — Baseline tự-chứa + cắt 58→44–46**
- [ ] V10 realtime membership vào baseline + verify · V11 drop 6 cron-fn hỏng · V12 cắt DB (fold 7 dễ; high-blast=decision) · V13 FK tiền CASCADE→RESTRICT · V14 storage policies

**P3 — Xoá CUT + repoint + types**
- [ ] V15 regen types từ uozwee · V16 xoá GL/production/payroll trees + rebuild finance/inventory page · V17 drop ~70 zombie RPC + outbox triggers · V18 employee-scheduling repoint (decision) · V19 drift-linter

**P4 — Back-office + money**
- [ ] V20 cash-book UI · V21 HĐĐT config-guard + bỏ 'CTCP' + reconcile · V22 integration money tests + CI test · V23 UX beat-Excel + scorecard điện thoại · V24 rate-limiter fail-closed + perf/index cleanup

**P5 — Docs** · [ ] reframe CTCP→HKD + sync `database.md` refs + V24b promote rules→`docs/agent/rules/`

**P6 — Cutover (OWNER-GATED)** · [ ] V25 ETL `migrate-data.sql` + runbook + reconcile fail-loud

## Surviving deferred items (still relevant under greenfield, NOT in the audit roadmap)

### Pre-launch / infra
- [ ] Stand up a dev/staging Supabase carrying the **lean 58-table baseline** to test
  app-on-lean (P2 prereq); Vercel Preview before external users.

### KEEP-module follow-ups
- [ ] **POS calls provider before DB lock** — RPC fail = orphan gateway order
  (DEFER-WITH-MITIGATION per m4 plan). Payments are KEEP.
- [ ] **HĐĐT post-pilot**: reconcile cron for orphan `signing` (admin retry covers pilot);
  replace-flow TT78 (pilot = cancel + manual portal); PDF/XML persist + download UI.
  (3-way PO↔GRN↔Invoice matching DROPPED — formal-PO is cut.)
- [ ] **F-018 Supplier "Khác"** — BLOCKED-PRODUCT: (a) require formal NCC, (b) "Mua ngoài"
  + inline note, or (c) accept generic "Khác". Owner product input needed.
- [ ] **transfer_ownership(p_new_user_id) RPC + UI** — blocked on business design
  (instant vs 2-phase, audit shape, permission gate); manual SQL UPDATE OK for pilot (ADR 0005).

### Post-launch ops (after go-live)
- [ ] Uptime monitor on `/api/health` (UptimeRobot — ops, not code).
- [ ] Ops reconciliation query for MoMo payment/order desync in `/admin/finance`.
- [ ] Inventory smoke regression runbook (`docs/runbooks/inventory/pre-release-qa.md`) — periodic.

## Doc maintenance

- When a module's behavior changes, update its canonical doc (`docs/modules/*`,
  `docs/ref/*`, `docs/spec/*`) in the same PR; honor `docs/worklog/README.md` retention;
  reframe CTCP→HKD on touch (greenfield P5).

## Post-v1.0 (Tier 2 — future, post-launch)

- [ ] QR Self-Order tại bàn
- [ ] Loyalty / Vouchers
- [ ] Advanced Analytics
- [ ] VNPay integration
- [ ] Employee portal full features
