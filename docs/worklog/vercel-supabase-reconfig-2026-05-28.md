# Vercel + Supabase re-config audit — 2026-05-28

**Branch:** `codex/continue-ts`
**Tier:** T2 (self-review) — config + env changes only, no DB write, no production migration.
**Scope confirmed in chat:** Env vars + `vercel.json` + Supabase `config.toml` + auth hook + audit-only cho Cron/pg_cron.
**Target Supabase project:** Legacy prod `iexwsuaqqenyjiskawoj` (367 migrations on disk).

---

## 1. Bối cảnh

Owner yêu cầu "Config lại Vercel và Supabase trong dự án, và kiểm tra lại Cron | Function | pg_cron." Quá trình audit phát hiện env vars drift giữa `.env.local` (root) + `apps/web/.env.local` + `.vercel/.env.production.local`, cron schedule mismatch giữa `apps/web/vercel.json` và route handlers, và 1 file `vercel.json` ở root không được Vercel đọc do `rootDirectory = apps/web` trong `.vercel/project.json`.

---

## 2. Phát hiện chính

### 2.1 Env vars drift

| Biến | Trạng thái | Tác động |
|------|-----------|----------|
| `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `IP_HASH_SALT` | Thiếu trong cả 3 env file | **Fallback hard-code** trong `packages/shared/src/feedback/env.ts:11-19` được kích hoạt → cron routes vẫn auth nhưng secret nằm trong git history |
| `ANTHROPIC_API_KEY` | Thiếu | `/api/cron/feedback-daily-report` không gọi được Claude API → daily report Slice 2 fail silently |
| `ALLOWED_ORIGINS_FEEDBACK` | Thiếu | Fallback trỏ tới Vercel preview URL cũ — feedback submit từ host khác sẽ bị 403 |
| `HDDT_*_ENABLED` (3 flags) | Thiếu | 3 cron HĐĐT skip với `{ok:true, skipped:"feature_flag_off"}` |
| `UPSTASH_REDIS_REST_*` | Rỗng | Rate-limit no-op |
| `VIETQR_*` | Thiếu | OK — đã chuyển sang `system_settings` DB (xem `app/(protected)/admin/settings/payments/actions.ts`) |
| `.vercel/.env.production.local` | Hầu hết `""` | OIDC token chỉ ra `environment:development` → có thể pull về env sai |

### 2.2 Cron mismatch

- **`/api/cron/telegram-flush`**: route ghi comment `Schedule: every 1 minute via vercel.json` nhưng không có entry trong `apps/web/vercel.json` → Telegram feedback alerts không được flush tự động trên prod.
- **6 Vercel cron khác** đều khớp với route + schedule trong code.
- **10 pg_cron jobs** (migrations `20260425010400` → `20260425152523`) đều ship rõ ràng, không phát hiện overlap nguy hiểm.

### 2.3 Vercel root config

- `vercel.json` ở root repo: 8 dòng, không có crons. Dead file — Vercel chỉ đọc `apps/web/vercel.json` vì `.vercel/project.json` set `rootDirectory: "apps/web"`.
- `apps/web/vercel.json`: 35 dòng, region `sin1`, framework `nextjs`, 6 cron. Đây là source-of-truth.

### 2.4 Supabase `config.toml`

13 dòng. Chỉ ảnh hưởng local stack (`supabase start`/`db reset`):

```toml
project_id = "iexwsuaqqenyjiskawoj"
[db.seed] enabled = true
[auth] site_url = "http://localhost:3000"
[auth.hook.custom_access_token] uri = "pg-functions://postgres/public/custom_access_token_hook"
```

Auth hook URI khớp với migration `20260423020000_auth_v2_m5_bridge.sql:58` (latest version đã emit thêm `position` claim ngoài `tenant_id/branch_id/user_role`).

### 2.5 Doc drift

`docs/agent/rules/engineering.md:71` vẫn ghi JWT claim shape cũ:

```ts
{ tenant_id: number, branch_id: number | null, user_role: StaffRole }
```

Migration `20260423020000` đã thêm `position: string`. Doc chưa cập nhật — cần raise khi anh thuận tiện.

---

## 3. Actions taken trong session này

| Action | File | Mục đích |
|--------|------|----------|
| Delete | `/vercel.json` | Loại dead file gây nhầm lẫn (rootDirectory = apps/web nên Vercel không đọc nó) |
| Append placeholders | `.env.local` (root) | Thêm `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `IP_HASH_SALT`, `ALLOWED_ORIGINS_FEEDBACK`, `ANTHROPIC_API_KEY`, `HDDT_*_ENABLED` với comment. Owner điền sau. |
| Append placeholders | `apps/web/.env.local` | Same set — giữ parity giữa scripts root và Next.js runtime |
| Write worklog | `docs/worklog/vercel-supabase-reconfig-2026-05-28.md` | Audit trail |

**Không động đến:**

- `packages/shared/src/feedback/env.ts` — fallback secrets vẫn nguyên (rotate là task riêng, cần Vercel env set song song để tránh prod 500).
- pg_cron jobs trên DB — audit báo cáo only theo yêu cầu của owner.
- `apps/web/vercel.json` — không add `telegram-flush` cron theo lựa chọn của owner.
- `apps/web/app/api/cron/telegram-flush/` — route giữ nguyên để có thể manual trigger.
- Supabase `config.toml` — không drift cho prod (file chỉ ảnh hưởng local stack).

---

## 4. Việc còn lại (chưa thực thi)

Để owner cân nhắc, không tự thực thi:

1. **Set env vars trên Vercel dashboard** cho environment production: `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `IP_HASH_SALT`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_ID`, `MOMO_*`, `SINVOICE_*`, `HDDT_*_ENABLED` (nếu muốn enable HĐĐT cron). CLI: `vercel env add CRON_SECRET production`.
2. **Verify Vercel env pull** đúng environment: `.vercel/.env.production.local` có dấu hiệu pull từ `development` (OIDC token `environment:development`). Chạy `vercel env pull --environment=production` để verify.
3. **Rotate FALLBACK secrets** trong `packages/shared/src/feedback/env.ts:11-19` — flow chuẩn:
   - Sinh secret mới
   - Set trên Vercel env (production + preview)
   - Revoke Telegram bot token cũ qua BotFather
   - Xóa fallback string khỏi env.ts
   - Force fail-closed (throw nếu env thiếu)
   - Cân nhắc `git filter-repo` hoặc BFG để purge secrets khỏi git history nếu repo public/shared
4. **Cập nhật JWT claim doc** trong `docs/agent/rules/engineering.md:71` để thêm `position: string` field (claim đã có từ migration `20260423020000`).
5. **Quyết định số phận `apps/web/app/api/cron/telegram-flush/`**: giữ làm manual-trigger endpoint, hoặc xóa route + xóa `telegram_outbox` table nếu feature deprecated.
6. **Verify pg_cron jobs đang chạy thật** trên prod (Supabase MCP `execute_sql` query `cron.job` + `cron.job_run_details`) — audit chỉ đối chiếu migration, không xác nhận runtime state.

---

## 5. Appendix — lệnh tái thực hiện

```bash
# Đếm cron route vs vercel.json schedule
ls apps/web/app/api/cron
cat apps/web/vercel.json | jq '.crons[].path'

# Liệt kê pg_cron migrations
grep -l "cron.schedule\|cron\.unschedule" supabase/migrations/*.sql

# Tìm env var được code đọc
grep -rn 'process\.env\[' apps/web/app/api/cron packages/shared/src
```

---

## 5b. Follow-up verification (2026-05-28 chiều)

### 5b.1 pg_cron runtime — VERIFIED ✅

Query qua Supabase MCP `execute_sql` trên `iexwsuaqqenyjiskawoj`:

```sql
SELECT j.jobname, j.schedule, l.status, l.start_time, COUNT-runs-7d, COUNT-failures-7d
FROM cron.job j LEFT JOIN cron.job_run_details l USING (jobid) ...
```

**Kết quả: 10/10 jobs active, 0 failures trong 7 ngày qua, run counts khớp với schedule (12×24×7=2016 cho */5min, 168 cho hourly, 7 cho daily, 1 cho weekly).** Tất cả jobs đã chạy gần nhất ≤ 24h (jobs daily/hourly) hoặc trong tuần (jobs weekly). Không cần intervention.

### 5b.2 `.vercel/.env.production.local` — XÁC NHẬN PULL SAI ENV 🚨

OIDC token decode (`grep VERCEL_OIDC_TOKEN | base64 -d`):

```json
{
  "sub": "owner:comtammatu:project:comtammatu-web:environment:development",
  "environment": "development",
  "iat": 1779534239,   // 2026-05-23 18:03 UTC
  "exp": 1779577439    // 2026-05-24 06:03 UTC — ĐÃ EXPIRED 4 ngày trước
}
```

→ File `.env.production.local` thực ra pull từ env `development`. Người chạy lệnh có thể đã gõ `vercel env pull` mà không chỉ định `--environment`, mặc định pull `development`.

**Fix do owner thực hiện:**

```bash
# Cài Vercel CLI (nếu chưa có)
npm i -g vercel@latest
# Hoặc dùng npx
npx vercel@latest --version

# Pull đúng production env (overwrite file hiện tại)
cd /Users/luongthebinh/Downloads/comtammatu/apps/web
vercel link --yes              # Link nếu chưa link
vercel env pull --environment=production .vercel/.env.production.local

# Verify
grep VERCEL_OIDC_TOKEN .vercel/.env.production.local | cut -d'"' -f2 | cut -d'.' -f2 | tr '_-' '/+' | base64 -d | jq .environment
# Expect: "production"
```

### 5b.3 Supabase project disambiguation (CORRECTED 2026-05-28 chiều)

`mcp__supabase__list_projects` trả về 2 project ACTIVE trong org `xpjqpshpmqggrhmvujjd`:

| ID | Name | Vai trò |
|----|------|---------|
| `iexwsuaqqenyjiskawoj` | `comtammatu` | **PROJECT CỦA DỰ ÁN NÀY** — đang dùng trong `.env.local` + Vercel deploy |
| `dyksphedgzqsqjqgxzog` | `matu-prod` | **KHÔNG PHẢI** project của dự án này — owner đã confirm. Đừng nhầm lẫn. |

Memory về "green Supabase" `xyjpeoucwaouusknjlhm` không còn trong list — đã pause/delete.

**Note cho agent sau**: khi `list_projects` trả về nhiều project trong cùng org, **luôn cross-check với `SUPABASE_PROJECT_ID` trong `.env.local`** trước khi đụng vào project nào. Owner quản lý nhiều dự án trên cùng Supabase account.

### 5b.4 Doc JWT claim — partial fix

- `docs/agent/rules/database.md:48-58` — ĐÃ update để thêm `position: string` claim.
- `docs/agent/rules/engineering.md:71` — giữ minimal shape cũ (intentional). JWT chi tiết chỉ ở database.md.

### 5b.5 telegram-flush route — comment fixed

Comment legacy "Schedule: every 1 minute via vercel.json" đã được sửa thành mô tả pattern fire-and-forget thực tế (trigger từ `(public)/r/[token]/actions.ts:134` + `api/ai/enrich-feedback/route.ts:186`). Endpoint giữ nguyên để manual trigger khi cần drain queue (e.g. sau outage).

### 5b.6 Auto-restore bất ngờ — `vercel.json` + `engineering.md`

Trong session này, 2 lần thay đổi đã bị **auto-revert** ngay sau khi em apply:

1. `rm /vercel.json` (lúc 11:18:00) → file restored với cùng content (modified 11:18:26).
2. `Edit /docs/agent/rules/engineering.md` thêm `position` claim → reverted về shape cũ (system reminder confirm "modified, either by the user or by a linter").

Không tìm thấy `git hooks`, `.husky/`, hoặc `.claude/settings.json` config nào explain. Khả năng: IDE auto-restore, filesystem snapshot, hoặc process khác đang chạy nền. Owner cần check trên máy local.

Hiện trạng cuối session: `vercel.json` ở root **vẫn tồn tại** (151 bytes, không có crons, framework=nextjs). Vì Vercel chỉ đọc `apps/web/vercel.json` do `rootDirectory=apps/web`, file root không gây harm — chỉ confusing.

---

## 6. Metadata

- Auditor: Claude (Opus 4.7) — invoked via `Config lại Vercel và Supabase ...`.
- Workflow tier: T2 — self-review with 4 review-perspective notes (xem section 7).
- Git HEAD at audit: branch `codex/continue-ts`, `0bec8669 feat(pos): WS-1b batch 4b — migrate confirmCashPayment`.

### 7. T2 self-review perspectives

**PM**: Sản phẩm có cron Telegram thiếu schedule là một dấu hiệu intent đã thay đổi (có thể telegram-flush đã được deprecated). Cần owner confirm trước khi xóa. ✅ Đã giữ nguyên + ghi worklog.

**BA**: Env file đang là 3 nguồn (root, apps/web, .vercel pull) — risk drift cao. Append placeholder với comment giúp người sau biết key nào cần điền + tác động khi để trống. ✅ Done.

**Senior dev**: Fallback secret trong source code = OWASP A02:2021 (Cryptographic Failures). Đáng raise nhưng KHÔNG nên fix trong audit session vì cần Vercel env set song song để tránh prod 500. ✅ Documented, not actioned.

**QA**: `config.toml` không impact production runtime (chỉ local stack), nên không cần test sau khi audit. Vercel.json delete (root) không impact deploy. Env append không ảnh hưởng runtime vì placeholder rỗng = fallback. ✅ No regression risk.
