# Release: `feedback-v1.0.0` — QR Feedback Module (2026-05-08)

> **Customer-facing QR feedback collection with Telegram alerts, AI enrichment, and daily reports.**
> First release of the feedback module. Tag: `feedback-v1.0.0`. Git: `449850f5` on `main`.

## Summary

Cơm Tấm Má Tư now lets customers submit feedback by scanning a QR code on the table (or printed by entrance / receipt). Owner gets:

- **Realtime Telegram alerts** for low-rating submissions (≤3★ by default, configurable threshold/all/none)
- **AI-enriched inbox** with auto-categorization (25 taxonomy keys), severity, sentiment score, Vietnamese summary
- **Daily AI reports** via cron (02:00) with markdown output
- **Per-branch ACL** — owner / super_manager / quan_ly_CN / quan_ly_vung / tro_ly_giam_doc / ke_toan_truong / ke_toan all see the right slice
- **PHI-safe defaults** — phone masked unless permission, IP hashed not stored, retention cron auto-NULLs old PII

## Customer experience

1. Customer scans QR → lands on `/r/{token}`
2. Picks rating 1–5 (emoji picker), writes ≥10-char comment, optionally adds phone + ≤3 photos (≤5MB each, JPEG/PNG/WEBP/HEIC)
3. Submit → redirect to `/r/{token}/thank-you`
4. If rating ≤3 (configurable), owner gets Telegram alert within ~30s

Customer-facing routes:
- `GET /r/[token]` — feedback form
- `GET /r/[token]/thank-you` — confirmation

## Owner / Manager experience

| Route | Roles | Purpose |
|---|---|---|
| `/admin/feedback` | owner, super_manager, quan_ly_CN, quan_ly_vung, tro_ly_giam_doc | Inbox with rating/suspect filters, masked phone view, AI badges, drawer detail |
| `/admin/feedback/qr` | owner only (sub-page guard) | CRUD QR codes per branch + table, auto-generated label, rotate token, deactivate |
| `/admin/feedback/settings` | owner, super_manager | Telegram destinations (HQ + per-branch), AI budget cap, push mode, threshold rating |
| `/admin/feedback/reports` | owner, super_manager, ke_toan_truong, ke_toan, tro_ly_giam_doc | Daily AI reports (auto-generated 02:00) |

## Slices

### Slice 1 — Submit + Telegram (foundation)
**Migrations (5):** `feedback_create_tables`, `feedback_rls_policies`, `feedback_masked_phone_view`, `submit_feedback_rpc`, `feedback_permission_keys`

- Public `/r/[token]` form: 4 fields (rating, comment, phone, photos), rate limit (5/token/30min, 20/IP/30min), honeypot field, `Origin` check
- `submit_feedback` SECURITY DEFINER RPC — atomic feedback row + telegram_outbox enqueue
- Cron worker `/api/cron/telegram-flush` (30s) drains outbox with exponential backoff (1m/2m/4m/8m/16m, max 5 attempts)
- Admin UI shells: inbox + QR CRUD + Telegram destinations CRUD
- 6 permission keys: `feedback:view`, `feedback:view_phone`, `feedback:view_report`, `feedback:manage_qr`, `feedback:manage_telegram`, `feedback:manage_settings`
- RLS: `INSERT/UPDATE/DELETE` on `feedbacks` REVOKED from `authenticated` — only the RPC can write

### Slice 2 — AI enrichment + daily reports
**Migrations (2):** `feedback_daily_reports`, `feedback_settings`

- AI Tier 1 enrichment via `/api/ai/enrich-feedback` — fills `ai_categories[]`, `ai_severity`, `ai_summary_vi`, `ai_sentiment_score`, `alert_priority`
- 25-category taxonomy (`food.quality.*`, `service.*`, `hygiene.*`, `pricing.*`, `ambience.*`, `praise.*`, `suggestion.*`, `other`) — validated by Postgres CHECK function `feedback_validate_categories`
- AI Tier 2 daily report cron 02:00 — markdown summary persisted in `feedback_daily_reports`
- Drawer detail UI shows AI badges + sentiment + critical-priority flag
- Settings: AI budget cap (cost ceiling), push mode (`all` / `threshold` / `none`), threshold rating (default 3)

### Slice 3 — Hardening
**Migrations (6):** `submit_feedback_rpc_v2`, `feedback_photos_storage`, `feedback_retention_rpc`, `feedback_moderate_permission`, `telegram_destinations_circuit_breaker`, `bulk_mark_suspect_rpc`

- Photo upload: client compress + private Storage bucket `feedback-photos` + 5MB limit + mime allowlist + signed URLs (TTL 10min)
- Path convention: `<tenant_id>/<feedback_id>/<filename>` + freshness window (5 min, anti-IDOR) + double-upload guard
- Print-friendly QR PDF (1/A4 single-table + 8/A4 multi-table) with logo + auto-generated label
- Retention cron 03:00: comment text 24m delete, phone NULL after 6m, IP hash NULL after 3m, photos cleaned with rows
- Bulk mark suspect (spam triage) — gated by `feedback:moderate` permission
- Telegram circuit breaker — destination auto-deactivates after 10 consecutive failures

## Architecture highlights

- **Defense-in-depth security:** FORCE RLS on all 4 tables, single permissive policy (no OR-merge), `submit_feedback` uses `SET search_path = public, pg_temp` (search-path injection defense), `feedbacks_with_masked_phone` view uses `security_invoker = true` (Postgres 15+ column-level masking pattern)
- **PHI minimization:** raw phone never logged, IP hashed (SHA-256 + rotating salt), `submit_ip_hash` exposed only as `has_ip_hash` boolean to prevent cross-session correlation
- **Bot defense:** 14-char token from `crypto.getRandomValues` (~83 bits entropy) + honeypot + `Origin` check + per-token + per-IP rate limit + freshness window on photo upload
- **Multi-tenant ACL:** route-level via `proxy.ts` + module ACL, row-level via `staff_permissions` + `has_permission(branch, key)` SQL helper
- **Idempotent on retries:** `telegram_outbox` has `UNIQUE feedback_id`, `ON CONFLICT DO NOTHING` insert in RPC

## Files & lines

| Layer | Files | LoC (approx) |
|---|---|---|
| Migrations | 13 SQL files (`supabase/migrations/20260511*`) | ~1,200 |
| Shared module | `packages/shared/src/feedback/*` (10 files + 8 test files) | ~800 |
| Web routes | `apps/web/app/r/[token]/*` + `apps/web/app/admin/feedback/*` | ~2,500 |
| API routes | `/api/cron/telegram-flush`, `/api/cron/feedback-{retention,daily-report}`, `/api/ai/enrich-feedback` | ~600 |
| **Total** | **~50 files** | **~5,100 LoC** |

## Environment variables

Required in production (Vercel → Settings → Environment Variables):

| Var | Purpose | Source |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot for alerts | BotFather |
| `CRON_SECRET` | Bearer auth on `/api/cron/*` and AI enrichment | Generate (32+ random bytes) |
| `ALLOWED_ORIGINS_FEEDBACK` | Comma-separated allowlist for `/r/[token]` submit (e.g., `https://app.comtammatu.com`) | Production domain(s) |
| `IP_HASH_SALT` | Rotating salt for `submit_ip_hash` | Generate (16+ random bytes), rotate quarterly |
| `NEXT_PUBLIC_APP_URL` | Self-fetch base for fire-and-forget calls (`https://app.comtammatu.com`) | Production URL |
| `ANTHROPIC_API_KEY` | AI enrichment + daily report | Anthropic Console |

> **⚠️ ISSUE-001 (HIGH):** `ALLOWED_ORIGINS_FEEDBACK` MUST be set in production. If empty, the `Origin` check is bypassed and any host can POST to the submit action. Verify with `vercel env ls production | grep ALLOWED_ORIGINS_FEEDBACK`.

## Apply procedure

After tagging, owner does (per CLAUDE.md production migration policy):

```bash
# 1. Apply 13 migrations to production via Supabase Dashboard SQL editor or supabase CLI
#    (Owner-only step — automated apply is disabled per CLAUDE.md)
supabase db push --db-url "$SUPABASE_DB_URL" --include-all

# 2. Regenerate database types
pnpm db:types

# 3. Set env vars in Vercel (see above)
# 4. Smoke test: scan one QR end-to-end + verify Telegram message arrives
```

## QA verification

Read-only QA pass against production (2026-05-07): **`docs/qa/feedback-qa-2026-05-07.md`** (or `.gstack/qa-reports/qa-report-feedback-module-2026-05-07.md` if local-only).

- **Health score:** 63.5 / 100 (architect-verified — see ISSUE-015/016 added by reviewer)
- **Findings:** 16 total — 2 HIGH, 4 MEDIUM, 6 LOW, 4 INFO

### Known issues (must follow up — see `tasks/todo.md`)

**HIGH (do these first):**
- **ISSUE-001** — Verify `ALLOWED_ORIGINS_FEEDBACK` env in production, fail-closed if empty
- **ISSUE-012** — Add 5 missing security headers via `next.config.ts headers()`: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy

**MEDIUM:**
- **ISSUE-002** — Photo upload IDOR within 5-min window (architectural; mint per-submission upload token)
- **ISSUE-003** — Replace fire-and-forget `fetch()` for telegram-flush + AI enrichment with `after()` from `next/server`
- **ISSUE-004** — Tighten photo storage RLS to gate by branch (currently tenant-only)
- **ISSUE-013** — `/r/[token]/thank-you` should `notFound()` for invalid tokens (phishing vector — bogus token renders fully branded "Cảm ơn" page)

See full report for LOW + INFO items.

### Things that are confirmed good

- ✓ FORCE RLS on all 4 feedback tables
- ✓ `submit_feedback` SECURITY DEFINER + `SET search_path = public, pg_temp`
- ✓ EXECUTE on submit RPC granted only to `service_role`
- ✓ Phone masking via `feedbacks_with_masked_phone` view with `security_invoker = true`
- ✓ Photo bucket private + 5MB limit + mime whitelist
- ✓ Comment rendered as React text node (no XSS surface)
- ✓ Token uniqueness + length=14 CHECK at DB level
- ✓ Admin proxy-level ACL: all `/admin/feedback/*` routes redirect unauth users (verified end-to-end)

## Migrations included

```
supabase/migrations/
├── 20260511000100_feedback_create_tables.sql
├── 20260511010000_feedback_rls_policies.sql
├── 20260511020000_feedback_masked_phone_view.sql
├── 20260511030000_submit_feedback_rpc.sql
├── 20260511040000_feedback_permission_keys.sql
├── 20260511050000_feedback_daily_reports.sql
├── 20260511060000_feedback_settings.sql
├── 20260511070000_submit_feedback_rpc_v2.sql
├── 20260511080000_feedback_photos_storage.sql
├── 20260511090000_feedback_retention_rpc.sql
├── 20260511100000_feedback_moderate_permission.sql
├── 20260511110000_telegram_destinations_circuit_breaker.sql
└── 20260511120000_bulk_mark_suspect_rpc.sql
```

## Commit range

```
449850f5 docs(qa): add 16 deferred bugs from feedback module QA pass     ← tag points here
275a9bb4 feat(feedback): hardcoded env fallbacks for MVP deploy
26aa106a chore(feedback): code-simplifier pass — merge imports + remove obvious comments
6ad65135 chore(feedback): post-merge fixes — regen types + null-handling + migration ordering
290c56e3 merge: feat/feedback-module into main — resolve conflicts
41b4a56e feat(feedback): module Slice 1+2+3 — QR phản ánh + Telegram + AI báo cáo  ← squashed merge
```

## Credits

Module design + implementation: Cơm Tấm Má Tư engineering. QA pass + architect verification: read-only audit against production (2026-05-07).
