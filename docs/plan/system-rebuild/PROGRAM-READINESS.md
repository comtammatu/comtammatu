# Program Readiness — Greenfield Cutover

> **Vai trò:** Master document cho rebuild program. Mọi plan docs khác là sub-document của file này.
> **Date:** 2026-05-07
> **Owner:** ngocnghia128@gmail.com
> **Locked principle:** Không phân chia version. Green = baseline duy nhất đi tiếp. Blue = artifact lịch sử read-only. Anything else = "archived" hoặc "drop". Không có "v1/v2/v3" trong codebase mới.

---

## §1. Executive Summary

### Tình trạng hiện tại (root cause của fragmentation)

- **24 plan docs** trong `docs/plan/` — 5 program-level + 5 inventory-specific + 5 UI-rebuild + 9 module-specific. Nhiều cái superseded nhưng chưa archive, tạo ambiguity về canonical source.
- **3 in-place sprint** đang chạy song song với program-level greenfield rebuild:
  - `finance-redesign.md` — 2-week sprint khởi động 2026-05-06
  - `m4-payments-fix` branch — refund flow trên blue
  - 5 migrations untracked (H3a/H3b/H2a/H2b/audit_logs) — đã apply local, chưa merge
- **2 sign-off tables phân tán** — 10 blockers ở `10-ROADMAP.md §3`, 8 blockers ở `inventory-v2-rebuild.md §13`. Owner phải đọc 2 chỗ.
- **Versioned naming patterns** — `auth v2`/`v3`, `inventory v2`, `M0–M7` milestones. Mỗi pattern này = 1 nguồn legacy debt mới sau cutover.

### Master doc làm gì

1. **Lock principle** — green = baseline duy nhất. Blue = read-only artifact. Versioned naming bị drop.
2. **Freeze in-place work** — finance-redesign, m4-payments-fix, 5 migrations untracked dừng ngay; logic port sang green baseline trong wave tương ứng.
3. **Consolidate** — 24 plan docs → 8 canonical, 19 archive (xem §2).
4. **Single sign-off** — gộp 10 program blockers + 8 inventory blockers + module-specific blockers vào 1 table duy nhất (xem §6).
5. **Reframe module catalog** — không còn V1/V2 catalog; chỉ liệt kê CAPABILITIES cần có cho green (xem `05-MODULE-CATALOG.md`).

### Status tổng quan

| Decision | State | Date | Source |
|---|---|---|---|
| Full-system rebuild scope | LOCKED | 2026-05-05 | `system-rebuild/00-DEBATE-SYNTHESIS.md` |
| Blue/green strategy | LOCKED | 2026-05-05 | `system-rebuild/02-GREEN-BASELINE.md` |
| Bỏ fork (giữ repo `comtammatu`) | LOCKED | 2026-05-06 | `tasks/todo.md` line 22 |
| No version split principle | LOCKED | 2026-05-07 | This doc |
| In-place freeze | LOCKED | 2026-05-07 | This doc §3 |
| 21 owner blockers (B1–B21) | APPROVED | 2026-05-07 | This doc §6 |
| Module catalog (12 modules) | DRAFT | — | `05-MODULE-CATALOG.md` (TBD) |
| Wave plan reconciled (W0–W6) | DRAFT | — | `06-WAVE-PLAN.md` (TBD) |
| Data audit run | NOT STARTED | — | depends on §6 + audit access |

---

## §2. Canonical Plan Map

### 8 Canonical Documents (keep)

| # | Path | Vai trò |
|---|---|---|
| 1 | `system-rebuild/PROGRAM-READINESS.md` | **Master** — entry point, single source of truth |
| 2 | `system-rebuild/01-BRAND-SOFTWARE-PROGRAM.md` | Brand + IA + route ownership matrix (folds super-app + ia-contract) |
| 3 | `system-rebuild/02-GREEN-BASELINE.md` | Schema baseline approach |
| 4 | `system-rebuild/03-DATA-MIGRATION-POLICY.md` | Keep / drop / archive / migrate / rebuild-from-source classes |
| 5 | `system-rebuild/04-CUTOVER-QA-RUNBOOK.md` | Cutover sequence + smoke tests + rehearsal |
| 6 | `system-rebuild/05-MODULE-CATALOG.md` | 12 modules × capabilities × dependencies (NEW) |
| 7 | `system-rebuild/06-WAVE-PLAN.md` | W0–W6 cross-module reconciled (NEW) |
| 8 | `decisions.md` + `adr/` | Architecture decisions + ADRs |

**Reference (kept as record, không phải canonical):**
- `system-rebuild/00-DEBATE-SYNTHESIS.md` — record of 4-agent debate output, frozen
- `system-rebuild/audit/` — data audit results (per run)
- `tasks/regressions.md`, `tasks/lessons.md`, `tasks/todo.md` — operational state

### 19 Documents → `docs/archive/plan/`

| # | Path | Reason archive |
|---|---|---|
| 1 | `platform-fork-2026.md` | Fork strategy abandoned 2026-05-06 |
| 2 | `super-app-merchant-platform-rebuild.md` | Folds vào `01-BRAND-SOFTWARE-PROGRAM.md` |
| 3 | `merchant-platform-ia-contract.md` | Folds vào `01-BRAND-SOFTWARE-PROGRAM.md` |
| 4 | `10-ROADMAP.md` | Folds vào `PROGRAM-READINESS.md` (§3, §6, §7) |
| 5 | `roadmap.md` | Module-level shipped history — keep as archive snapshot |
| 6 | `backlog.md` | Absorbed vào `06-WAVE-PLAN.md` |
| 7 | `inventory-redesign.md` | Capabilities folded vào `05-MODULE-CATALOG.md` (Inventory) |
| 8 | `inventory-v2-rebuild.md` | "v2" naming violates locked principle; capabilities folded vào module catalog |
| 9 | `inventory-location-ledger.md` | Folds vào module catalog (Inventory § "ledger model") |
| 10 | `inventory-location-ledger-phase2.md` | Same |
| 11 | `inventory-location-ledger-phase2-app-patch.md` | Same |
| 12 | `inventory-ui-ux-page-debate.md` | UI debate folds vào module catalog (Inventory § "page contracts") |
| 13 | `finance-redesign.md` | In-place sprint frozen; capability port plan in §3 + module catalog (Finance) |
| 14 | `m4-payments-fix.md` | In-place; capability port plan in §3 + module catalog (Finance) |
| 15 | `m2-order-lifecycle.md` | M-numbering deprecated; capabilities folded vào module catalog (Orders) |
| 16 | `ui-audit-map.md` | UI rebuild folds vào module catalog (per module § "page contracts") |
| 17 | `ui-redesign-review-loop.md` | Same |
| 18 | `ui-ux-markdown-layout-map.md` | Same |
| 19 | `ui-ux-page-contracts.md` | Same |
| 20 | `ui-ux-rebuild.md` | Same |

**Archive procedure:** `git mv` từng file → `docs/archive/plan/` + add 1-line note ở đầu mỗi file: `> ARCHIVED 2026-05-07 — content folded into <canonical doc>`. Không xóa nội dung; chỉ chuyển vị trí + cờ trạng thái.

### Drop / Rename naming patterns

| Pattern | Action |
|---|---|
| "auth v2", "auth v3" trong docs/code/comments | Rename → "auth" |
| "inventory v2" | Rename → "inventory" |
| "M0", "M1"…"M7" milestone refs | Drop — đã ship hết, không relevant cho greenfield |
| "M5-Ext", "S0–S9" sprint refs | Drop — sprint local cho redesign retired |
| "v1.0.0" tags trong roadmap | Keep (release artifact); không tạo "v2.0.0" sau cutover |
| Migration filename `vN_*` prefix nếu có | Drop — green baseline = single migration set |

Cleanup execution: 1 grep + replace PR riêng sau khi master doc chốt. Không gộp vào PR archive.

---

## §3. In-Place Work Freeze + Port Plan

### Freeze decision (locked 2026-05-07)

Tất cả in-place sprint trên `blue` đóng băng từ **2026-05-07 23:59 ICT**. Lý do: per locked principle "không phân chia version", không thể ship feature mới trên blue song song với green baseline build — sẽ tạo divergence + double-port effort.

### Frozen items + port destination

> **Reconciliation 2026-05-07 20:30 ICT (post-sign-off):** Doc viết sớm hơn reality. Verify với git log + Supabase `mcp__supabase__list_migrations` cho thấy **đa số "frozen" items đã merge + apply prod trước thời điểm sign**. True freeze chỉ còn 3 migration chưa apply prod. Bảng cập nhật state thực.

| In-place artifact | Reality state (verified 2026-05-07) | Action | Port plan |
|---|---|---|---|
| `finance-redesign.md` 2-week sprint | ✅ Migration `finance_hour_cashier_breakdowns` (= `get_revenue_by_hour`/`get_revenue_by_cashier`) DA apply prod (version `20260506022355`); migrations cha bao gồm `20260507000000_finance_phase1_journal_entry_period_guard_and_continuity` ✅ apply prod | ✅ Vacuously satisfied — apply đã xảy ra trước sign | Capabilities (8 KPI cards, filter bar, 4 chart types, reconciliation tolerance) vẫn port sang `05-MODULE-CATALOG.md` (Finance) → implement trong **W4** trên green baseline (re-build, không carry blue MV) |
| `m4-payments-fix` branch (refund flow) | ✅ Branch không tồn tại (local/remote/reflog/stash); RPCs `m4_refund_reversal_foundation`, `m4_reverse_payment_and_post_rpc`, `m4_create_refund_rpc` ✅ apply prod (versions `20260510*`); `m4_webhook_events_table` ✅ apply prod | ✅ Vacuously satisfied — branch đã merge sớm | RPC bodies + idempotency table → `02-GREEN-BASELINE.md` (Finance/Payments) → re-implement trong **W4** (không port code, viết lại theo green principle) |
| 5 "untracked" migrations từ §3 cũ | ✅ Tracked, committed today 12:28-12:30 (5 atomic commits `daf0b3c7`, `20a4e4f0`, `d0987060`, `135c48d7`, `475fe54b`) + pushed origin/main; **3 trong 5 đã apply prod**: `audit_logs_tenant_entity_created_idx` ✅, `h2a_refunds_update_perm_gate` ✅, `h2b_hr_payroll_perm_gate` ✅ | ✅ Vacuously satisfied cho 3 đã apply prod | Logic + invariants → `02-GREEN-BASELINE.md` (Auth + HR sections) → re-write trong **W1**/**W4** |
| `inventory-location-ledger` Phase 1 | ✅ Migration `20260417040000_inventory_locations_phase1` DA apply prod | ✅ Đã trên blue — keep as starting point | Schema (inventory_locations table + compat columns) → port nguyên trạng vào green baseline trong **W3** |
| **TRUE FREEZE — 3 migrations trong repo, CHƯA apply prod** | | | |
| `20260601100000_auth_v3_h3a_position_id_required.sql` | ❄️ Trong repo, chưa apply prod (verified absent từ Supabase migrations table) | ❄️ Hold — không apply | Logic → `02-GREEN-BASELINE.md` Auth § profiles.position_id NOT NULL → **W1** |
| `20260601500000_h3b_tenants_owner_user_id.sql` (ADR-0005) | ❄️ Trong repo, chưa apply prod | ❄️ Hold | Schema + decision → green baseline Auth § `tenants.owner_user_id` canonical → **W1** |
| `20260601700000_dead_rpc_drop_tier_a_pilot.sql` (M7) | ❄️ Trong repo, chưa apply prod | ❄️ Hold — drop tier A RPC pilot không tham gia green | Skip — green không carry dead RPC list, baseline sạch từ đầu |

### Hệ quả của freeze

- **Feature shipping pause:** ~2–3 tuần không có feature mới ship lên production. Owner phải accept.
- **Bug fix exception:** P0 bug fix vẫn cho phép apply lên blue, nhưng phải đăng ký vào `tasks/todo.md` § "Frozen-period exceptions" + commit message tag `[blue-only]` để track port.
- **Documentation freeze:** Stop update inventory-redesign.md, finance-redesign.md, etc. Mọi update đi vào `05-MODULE-CATALOG.md`.
- **Branch policy:** Không mở branch mới nhánh `feat/*` cho non-green work. Đổi tên hoặc archive: `m4-payments-fix` → `archive/m4-payments-fix-snapshot`.

### Frozen-period exception register

(Chưa có exception. Mỗi exception cần owner approve + entry vào table này.)

| Date | Item | Reason | Owner approve | Port wave |
|---|---|---|---|---|
| — | — | — | — | — |

---

## §4. Module Catalog Index

12 modules cross-cutting, single canonical catalog tại `system-rebuild/05-MODULE-CATALOG.md` (TBD). Per-module structure:

- Capability list (cái module phải làm được)
- Schema needed (tables/RPCs/views)
- Permission keys (permission catalog đơn nhất, không legacy)
- Dependencies (depends-on / depended-by)
- Sign-off blockers (blocker thuộc module này)
- Wave assignment (W0–W6)
- Page contracts (UI page list + ownership matrix entry)

| # | Module | Wave (planned) | Owner ACL key | Status |
|---|---|---|---|---|
| 1 | Auth | W1 | `auth:*` | catalog TBD |
| 2 | Admin | W2 | `admin:*` | catalog TBD |
| 3 | Master Data (tenants, branches, positions) | W2 | `settings:*` | folded into Auth + Admin |
| 4 | Employee | W2 | `employee:*` | catalog TBD |
| 5 | Inventory | W3 | `inventory:*` | catalog TBD (folds 5 inventory plan docs) |
| 6 | Finance / Accounting | W4 | `finance:*` | catalog TBD (folds finance-redesign + m4) |
| 7 | HR / Payroll | W4 | `hr:*` | catalog TBD |
| 8 | Orders | W5 | `orders:*` | catalog TBD (folds m2-order-lifecycle) |
| 9 | POS | W5 | `pos:*` | catalog TBD |
| 10 | KDS | W5 | `kds:*` | catalog TBD |
| 11 | Print | W5 | `print:*` | catalog TBD |
| 12 | Notifications + Reporting | W6 | `notif:*`, `reports:*` | catalog TBD |

Note: "Master Data" không phải module độc lập — fold vào Auth (tenants/positions) + Admin (branches). Nếu owner muốn tách, sẽ đặt thành module 13 và dời assignments.

---

## §5. Cross-Module Dependency Graph

(TBD — sẽ vẽ sau khi `05-MODULE-CATALOG.md` xong. Sketch dưới để context):

```
Auth ──> Admin ──> Master Data
  │        │
  ├──> Employee
  │
  ├──> Inventory ──> Finance ──> Reporting
  │       │             │
  │       └──> HR/Payroll
  │             │
  └──> Orders ──> POS ──> KDS ──> Print
                   │
                   └──> Finance (revenue path)
```

Dependency invariants:
- Auth W1 phải xong trước mọi module khác (JWT claims + ACL + RLS infrastructure).
- Master Data (tenants/branches/positions) phải seed trước Inventory + Finance + HR.
- Inventory W3 phải có stock_levels schema trước Orders W5 (POS consumption path).
- Finance W4 phải có period close + GL trước Reporting W6.

---

## §6. Consolidated Owner Sign-Off Table

Single source of truth cho mọi blocker. Gộp 10 blockers từ `10-ROADMAP.md §3` + 8 blockers từ `inventory-v2-rebuild.md §13` + module-specific blockers (TBD per module).

**Sign-off rule:** B1+B2+B19 phải approve để start data audit. B3–B10 + B11–B18 + per-module blockers phải approve để start W0 implementation.

### Program-level (B1–B10) — từ 10-ROADMAP.md

| # | Blocker | Recommendation | Owner | Date | Notes |
|---|---|---|---|---|---|
| B1 | Rebuild scope | Full-system, không Inventory-only | ☑ approve | 2026-05-07 | LOCKED 2026-05-05 |
| B2 | Data preservation default | KEEP/MIGRATE legal + operational data; DROP only sau audit + sign-off | ☑ approve | 2026-05-07 | |
| B3 | Auth user preservation | Preserve `auth.users` IDs + emails via Admin API import; force password reset email post-cutover — `adr/0001-auth-migration.md` | ☑ approve | 2026-05-07 | |
| B4 | DB provider | New Supabase project, same org, same region (ap-southeast-1) — `adr/0002-database-provider.md` | ☑ approve | 2026-05-07 | |
| B5 | Maintenance window | Overnight 22:00–04:00 ICT first cutover; 4h window + 2h buffer | ☑ approve | 2026-05-07 | |
| B6 | Blue retention period | Read-only 12 tháng (tax/audit retention); after 12 months → archive snapshot | ☑ approve | 2026-05-07 | |
| B7 | Reverse-delta (rollback after green writes) | Build minimal reverse-delta cho revenue tables; accept continue-forward fix cho `stock_movements`, `attendance` — `adr/0003-cutover-rollback.md` | ☑ approve | 2026-05-07 | |
| B8 | Brand authority | Ma Tu Concept 01 design system; no parallel theme layer; no per-route theme files | ☑ approve | 2026-05-07 | |
| B9 | Identifier language | Normalize Vietnamese/mixed-case identifiers → English `lower_snake_case` trong green; including position codes — `adr/0004-position-code-normalization.md` | ☑ approve | 2026-05-07 | |
| B10 | Audit access | Architect lead read-only + service-role-key via 1-week token; results → `system-rebuild/audit/results-YYYY-MM-DD.md` | ☑ approve | 2026-05-07 | |

### Inventory-specific (B11–B18) — từ inventory-v2-rebuild.md

| # | Blocker | Recommendation | Owner | Date | Notes |
|---|---|---|---|---|---|
| B11 | New Supabase project approved | Yes (covered by B4) | ☑ approve | 2026-05-07 | Ràng buộc với B4 |
| B12 | Auth migration strategy | Covered by B3 | ☑ approve | 2026-05-07 | Ràng buộc với B3 |
| B13 | Maintenance window length | Covered by B5 | ☑ approve | 2026-05-07 | Ràng buộc với B5 |
| B14 | Blue read-only retention period | Covered by B6 | ☑ approve | 2026-05-07 | Ràng buộc với B6 |
| B15 | Rollback after green writes required? | Covered by B7 | ☑ approve | 2026-05-07 | Ràng buộc với B7 |
| B16 | V1 data classes approved cho drop/archive/migrate | Per-table classification trong `03-DATA-MIGRATION-POLICY.md`; sign-off sau audit run | ☑ approve | 2026-05-07 | Block W3 |
| B17 | AP/supplier invoice scope keep or drop | KEEP (Finance/AP-adjacent, current code posts GL từ supplier payment paths) | ☑ approve | 2026-05-07 | Block W3 |
| B18 | Position-code casing cleanup included or deferred | INCLUDED (covered by B9) | ☑ approve | 2026-05-07 | Ràng buộc với B9 |

### Program-level addition (this doc)

| # | Blocker | Recommendation | Owner | Date | Notes |
|---|---|---|---|---|---|
| B19 | Freeze in-place work | YES — finance-redesign + m4-payments-fix + 5 untracked migrations đóng băng từ 2026-05-07 23:59 ICT, port sang green baseline trong wave tương ứng | ☑ approve | 2026-05-07 | This doc §3 |
| B20 | Archive 19 plan docs | YES — list trong §2 | ☑ approve | 2026-05-07 | This doc §2 |
| B21 | Drop versioned naming patterns | YES — auth v2/v3, inventory v2, M0–M7 milestones bị rename/drop | ☑ approve | 2026-05-07 | This doc §2 |

### W0' steal-first additions (B54–B57) — from /autoplan UC1+UC2+UC3 + ADR=A2 (2026-05-07)

| # | Blocker | Recommendation | Owner | Date | Notes |
|---|---|---|---|---|---|
| B54 | Convert `tasks/regressions.md` to `**RULE-NAME**:` named-rule format | YES — adopt matu-superapp parseable convention; enables `check-doc-cross-references.mjs` to validate rule references; agents can grep/load relevant rules without scanning full 62k-token file | pending | — | Phase 1.4 deliverable |
| B55 | Port matu-superapp CI gates (`check-no-version-suffixes.mjs` + `check-doc-cross-references.mjs`) | YES — solves B21 with CI enforcement (not 1-time grep); baseline tail tracked at `tasks/lint-baseline.md` (13 + 188 known violations across W0'/W1/W3 cleanup waves) | ☑ approve | 2026-05-07 | DONE Phase 0 (commit 38dc365b) |
| B56 | `require_recent_aal2()` MFA helper for sensitive RPCs | YES — period close, payroll approve, tenant legal change, provider secret rotation MUST gate on fresh AAL2 (per ADR-0011); matu-superapp learned the hard way | pending | — | W4 entry gate; Codex review flagged absent in current plan as CRITICAL |
| B57 | `private.provider_secrets` table replacing `system_settings.einvoice_provider`/`MOMO_*`/`VIETQR_*` env vars | YES — per ADR-0012 3-tier configuration boundary; current `system_settings` mixes config + secret = RLS leak risk per Codex review; envelope encryption (AES-256-GCM + KMS-sealed data key) | pending | — | W4 schema deliverable; migration plan in ADR-0012 §"Migration From Existing State" |

### Adopted ADR set sign-off (2026-05-07, all `proposed` pending owner accept)

| # | ADR | Description | Status |
|---|---|---|---|
| ADR-0006 | Frontline Flutter Client | UC1=YES path locks Flutter for POS/KDS/employee | proposed |
| ADR-0007 | Branch Hub Architecture | 1 device sole writer per branch + LAN/BT multi-transport | proposed |
| ADR-0008 | Handheld Failover Mode | Manual emergency direct-cloud per ADR-0007 companion | proposed |
| ADR-0009 | Background Jobs Runtime | PGMQ + pg_cron + Edge Functions layered model | proposed |
| ADR-0010 | Flutter Implementation Choices | Riverpod, Drift, go_router, native plugin set | proposed |
| ADR-0011 | MFA And Recovery | TOTP + `require_recent_aal2()` + backup codes + recovery RPC | proposed |
| ADR-0012 | Tenant Configuration Separation | `.env` / `public.tenant_settings` / `private.provider_secrets` | proposed |
| ADR-0013 | Rate Limit Fallback Policy | Renumbered from matu-superapp 0003; per-surface fail-open/closed | proposed |
| ADR-0014 | Realtime Channel Lifecycle | Renumbered from matu-superapp 0004; Hub fan-out + JWT-refresh resubscribe | proposed |

ADR-0001 (auth-migration) state remains `PROPOSED` — Codex review 2026-05-07 flagged execution layer rỗng despite B3 sign-off; needs detail before W1 entry.

### Module-specific (B22–Bxx)

(TBD — sẽ điền sau khi `05-MODULE-CATALOG.md` xong. Mỗi module catalog section sẽ có "Sign-off blockers" subsection contributing tới table này.)

---

## §7. Wave Plan Summary

(Detail trong `06-WAVE-PLAN.md` — TBD. Summary dưới):

| Wave | Scope | Gate | Cross-module |
|---|---|---|---|
| W0 | Design tokens, typography, logo, app shells | Design-system locked + reviewed | Foundation |
| W1 | Login + shared shell + Auth + Master Data | W0 + B1+B2+B3+B4+B19 approved | Auth, Master Data |
| W2 | Admin + Settings + Staff + Employee | W1 + persona ACL test green | Admin, Employee |
| W3 | Inventory greenfield (no V1 surface) | W2 + B16+B17 approved + inventory schema baseline | Inventory |
| W4 | Finance + HR/Payroll (port finance-redesign + m4 logic) | W3 + period/payroll invariants verified | Finance, HR |
| W5 | Orders + POS + KDS + Print | W4 + revenue parity confirmed | Orders, POS, KDS, Print |
| W6 | Notifications + Reporting + final brand pass | W5 + smoke suite green | Notifications, Reporting |

**Total wall time:** 14–16 tuần (1 dev parallel) | 10–12 tuần (2 devs split frontend × backend).

**Cutover candidate:** end of W6, sau migration rehearsal × 2 (per `04-CUTOVER-QA-RUNBOOK.md`).

---

## §8. Risk Matrix

| Risk | Severity | Mitigation |
|---|---|---|
| Owner không sign off blockers → wave plan stall | High | Surface blockers trong §6 ngay; freeze in-place tạo áp lực sign-off |
| In-place freeze gây áp lực business (P0 bug giữa freeze) | High | Frozen-period exception register §3; track explicit ports |
| Module catalog drift giữa các module owner | Medium | Single canonical doc `05-MODULE-CATALOG.md`; PR review block any duplicate |
| Auth migration breaks login post-cutover | High | `adr/0001-auth-migration.md` rehearsal × 2 trên green staging |
| Finance data divergence do reverse-delta gap | High | `adr/0003-cutover-rollback.md` reverse-delta cho revenue tables; continue-forward cho non-revenue |
| Storage object loss khi copy blue → green | High | Manifest + checksum trước/sau (`04-CUTOVER-QA-RUNBOOK.md`) |
| RLS leak trong baseline mới | High | Persona negative tests trong mỗi wave gate |
| Versioned naming rò rỉ vào green code | Medium | Lint rule + CI grep trước merge (TBD trong W0) |

---

## §9. Go / No-Go Checklist

**Pre-implementation gate** (W0 start):
- [ ] B1, B2, B3, B4, B5, B6, B7, B8, B9, B10 approved
- [ ] B19, B20, B21 approved
- [ ] In-place freeze in effect (verified: no new commits to `m4-payments-fix`, no new migrations applied to blue)
- [ ] 19 plan docs archived (verified: `docs/archive/plan/` populated)
- [ ] Versioned naming cleanup PR merged
- [ ] `system-rebuild/05-MODULE-CATALOG.md` complete (12 modules)
- [ ] `system-rebuild/06-WAVE-PLAN.md` complete (W0–W6 detailed)

**Pre-cutover gate** (end of W6):
- [ ] Migration rehearsal × 2 passed
- [ ] Persona smoke test (7 roles × 2 branches) green
- [ ] `pnpm typecheck && pnpm lint && pnpm build` green on green baseline
- [ ] Storage object manifest parity verified
- [ ] Reverse-delta tooling tested
- [ ] Blue read-only mode tested
- [ ] Rollback runbook rehearsed
- [ ] B16, B17, B22–Bxx (module-specific) all approved

**Post-cutover (W7+ stabilization):**
- [ ] Blue retention runbook active (12 months read-only)
- [ ] Green production smoke green ≥ 30 days
- [ ] No reverse-delta invocation needed
- [ ] Naming pattern lint rule active in CI

---

## §10. Sign-off Block

| Role | Name | Date | Decision (B1–B21) |
|---|---|---|---|
| Owner | ngocnghia128@gmail.com | 2026-05-07 | ☑ all approve |
| Lead Dev | _____________ | _____________ | ☐ feasible / ☐ revise |
| Architect | _____________ | _____________ | ☐ baseline ready / ☐ revise |
| QA Lead | _____________ | _____________ | ☐ verifiable / ☐ revise |
| Ops | _____________ | _____________ | ☐ provisionable / ☐ revise |

---

## §11. Cross-References

- **Strategy chapters:** `system-rebuild/{00-DEBATE-SYNTHESIS, 01-BRAND-SOFTWARE-PROGRAM, 02-GREEN-BASELINE, 03-DATA-MIGRATION-POLICY, 04-CUTOVER-QA-RUNBOOK}.md`
- **Module catalog:** `system-rebuild/05-MODULE-CATALOG.md` (TBD)
- **Wave plan:** `system-rebuild/06-WAVE-PLAN.md` (TBD)
- **ADRs:** `adr/0001-0005`
- **Audit results:** `system-rebuild/audit/`
- **Decisions log:** `decisions.md`
- **Regression rules:** `tasks/regressions.md`
- **Operational state:** `tasks/todo.md`

---

**End of master doc.** Update khi: (a) blocker decision flips, (b) wave ships, (c) cutover go/no-go scheduled, (d) module catalog adds new section.
