# Tóm tắt Ralph session — 2026-05-09

> **5 chu kỳ Ralph, 21 commit, 2 release production (`1.2.0.1` + `1.2.0.2`), tất cả CI/CD đều xanh, architect APPROVED ở mỗi chu kỳ.** Toàn bộ work là code-only hardening của QR feedback module ship trong `1.2.0.0` ngày 2026-05-08.

## Bối cảnh đầu session

- HEAD trước session: `94033a65` (merge của origin/main).
- Tags hiện có trên remote: `1.2.0.0` (QR feedback module, 2026-05-08).
- 16 known issues đang treo trong `tasks/todo.md` từ `/qa` pass 2026-05-07 (health 63.5/100).
- VERSION file lệch với CHANGELOG: `VERSION=1.1.0.0` nhưng CHANGELOG đã có entry `[1.2.0.0]`.
- Vercel alias `app.comtammatu.com` đang pin vào build cũ `dpl_4VMrXTgUSjybiTyEoj5QnKmnv6gN`.

## Ràng buộc do user đặt ra

- Build trực tiếp trên `main` (override default "feature branch + PR").
- Commit với user `comtammatu <comtammatu@gmail.com>` (đảm bảo Vercel auto CI/CD chạy đúng).
- Mọi sub-agent /qa phải chạy trong tmux với CLI `wclaude` (alias `CLAUDE_CONFIG_DIR="$HOME/.claude-work" claude --plugin-dir … --dangerously-skip-permissions`).
- Vòng lặp không dừng cho đến khi "comtammatu success" — interpretation: CI/CD xanh + kèm verification.

## 5 chu kỳ + 21 commit

| #   | Cycle                | Commits | Tag       | Health | Mô tả                                                                      |
| --- | -------------------- | ------- | --------- | ------ | -------------------------------------------------------------------------- |
| 1   | Hardening batch 1    | 12      | —         | 15/100 | 9 ISSUE từ `/qa` 2026-05-07 + 4 regression rules + deslop pass             |
| 2   | Architect follow-ups | 3       | —         | 8.5/10 | observability `after()` + 3 source-text regression tests + tightened regex |
| 3   | HSTS hardening       | 3       | —         | 8/10   | HSTS preload eligibility + 1 source-text test cho next.config.ts           |
| 4   | Release cut 1.2.0.1  | 1       | `1.2.0.1` | 8/10   | VERSION + CHANGELOG + release notes + annotated tag                        |
| 5   | Release cut 1.2.0.2  | 2       | `1.2.0.2` | 8.5/10 | robots.txt + security.txt + release notes mới                              |

### Cycle 1 — Hardening batch (12 commits)

| Commit     | Type              | ISSUE           | Mô tả                                                                                                                                                              |
| ---------- | ----------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `610123c8` | feat(security)    | 012 + 014       | CSP + 4 OWASP headers + `poweredByHeader: false`                                                                                                                   |
| `8e713af8` | fix(feedback)     | 001             | `ALLOWED_ORIGINS_FEEDBACK` fail-closed trong production                                                                                                            |
| `939be3d9` | fix(feedback)     | 013             | `/r/[token]/thank-you` 404 cho token invalid (chặn phishing)                                                                                                       |
| `c61db730` | chore(docs)       | —               | Đánh dấu ISSUE-001/012/013/014 shipped trong `tasks/todo.md`                                                                                                       |
| `79a30bb7` | fix(feedback)     | 003 + 007 + 015 | `after()` thay `void fetch()` + honeypot log + CSRF doc + warn-once                                                                                                |
| `003224c0` | fix(feedback)     | 016             | TOCTOU race trên `photo_paths` (conditional `WHERE` + `.select()`)                                                                                                 |
| `fec49ecd` | fix(feedback)     | 008             | Phân biệt error message: sanitize-stripped vs typed-too-few                                                                                                        |
| `ee71d005` | feat(feedback)    | 009             | `?only_suspect=true` triage filter trên admin inbox                                                                                                                |
| `35aca5f8` | chore(docs)       | —               | Đánh dấu thêm ISSUE-003/007/008/009/015/016 shipped                                                                                                                |
| `815c904f` | test(feedback)    | —               | Regression test cho ISSUE-008                                                                                                                                      |
| `042c908d` | docs(regressions) | —               | 4 named regression rules (SECURITY-HEADERS, FEEDBACK-THANK-YOU-MUST-NOTFOUND-INVALID, FEEDBACK-AFTER-NOT-FIRE-AND-FORGET, FEEDBACK-PHOTO-PATHS-CONDITIONAL-UPDATE) |
| `f0ab5191` | chore(feedback)   | —               | Mandatory deslop pass: bỏ numbered step comments + WHAT-only narration                                                                                             |

### Cycle 2 — Architect follow-ups #2 + #3 (3 commits)

| Commit     | Mô tả                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `2dbae2c5` | `console.warn` trên `after()` catch handlers (telegram-flush + ai-enrich riêng) — observability cho silent failures            |
| `fc832e25` | 3 source-text regression tests trong `packages/shared/src/feedback/__tests__/regressions.test.ts` lock các guard từ cycle 1    |
| `4543fab1` | Tighten regex cho thank-you guard (chuyển từ `[\s\S]*` greedy sang strict builder-chain match) + comment `import.meta.dirname` |

### Cycle 3 — HSTS preload + next.config test (3 commits)

| Commit     | Mô tả                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| `9f9f424d` | Strict-Transport-Security: `max-age=63072000; includeSubDomains; preload` (đủ điều kiện đăng ký HSTS preload list) |
| `60543ab8` | Source-text regression test cho 6 security headers + HSTS preload value + locked CSP directives                    |
| `4c148803` | Mở rộng SECURITY-HEADERS-IN-NEXT-CONFIG rule trong `tasks/regressions.md` (HSTS + test fragility note)             |

### Cycle 4 — Release 1.2.0.1 (1 commit + 1 tag)

| Artifact      | Detail                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| `cc8f17be`    | Single release commit: `VERSION` 1.1.0.0 → 1.2.0.1, CHANGELOG entry mới, `docs/releases/1.2.0.1.md` (113 dòng) |
| Tag `1.2.0.1` | Annotated, sha 89b81392, `git rev-parse 1.2.0.1^{}` == `cc8f17be` (HEAD lúc đó)                                |

### Cycle 5 — Release 1.2.0.2 (2 commits + 1 tag)

| Artifact      | Detail                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `4590aec6`    | 5 file: `apps/web/app/robots.ts` + `apps/web/public/.well-known/security.txt` (RFC 9116) + VERSION 1.2.0.1 → 1.2.0.2 + CHANGELOG entry + `docs/releases/1.2.0.2.md` |
| `51a825f5`    | Architect follow-up: mở rộng release notes 55 → 72 dòng (Related commits + Known limitations + Follow-ups parked)                                                   |
| Tag `1.2.0.2` | Annotated, sha b369d4fa, dereferences về `4590aec6`                                                                                                                 |

## ISSUEs đã ship vs còn lại

### Đã ship trong session

| ISSUE     | Severity          | Cycle | Commit                  |
| --------- | ----------------- | ----- | ----------------------- |
| ISSUE-001 | HIGH              | 1     | `8e713af8`              |
| ISSUE-003 | MEDIUM            | 1     | `79a30bb7`              |
| ISSUE-007 | LOW               | 1     | `79a30bb7`              |
| ISSUE-008 | LOW               | 1     | `fec49ecd` + `815c904f` |
| ISSUE-009 | LOW               | 1     | `ee71d005`              |
| ISSUE-012 | HIGH              | 1     | `610123c8`              |
| ISSUE-013 | MEDIUM            | 1     | `939be3d9`              |
| ISSUE-014 | LOW               | 1     | `610123c8`              |
| ISSUE-015 | INFO              | 1     | `79a30bb7`              |
| ISSUE-016 | architect-flagged | 1     | `003224c0`              |

### Deferred (cần DB migration hoặc owner action)

| ISSUE     | Lý do defer                                                                    |
| --------- | ------------------------------------------------------------------------------ |
| ISSUE-002 | Cần `submit_feedback` RPC change + storage RLS migration                       |
| ISSUE-004 | Cần migration cho photo storage RLS gate by branch                             |
| ISSUE-005 | Cần migration cho `feedback_retention_cleanup()` cascade                       |
| ISSUE-006 | `getFeedbackPhotoUrls` hiện là dead code (no callers) — không có business case |
| ISSUE-010 | Cần migration cho `(tenant_id, created_at DESC)` index                         |
| ISSUE-011 | Order snapshot heuristic — cần knowledge về DB schema                          |

## Quality gates

Mỗi commit đều pass:

- `pnpm typecheck` ✓
- `pnpm lint` ✓
- `pnpm --filter web build` ✓
- `pnpm --filter @comtammatu/shared test` ✓ (130-something → 147 cuối session, +3 tests cycle 2 + 1 cycle 3 + 1 ISSUE-008 regression)

GitHub Actions CI:

- Cycle 1 final SHA `c61db730`: SUCCESS
- Cycle 1 deslop SHA `f0ab5191`: SUCCESS
- Cycle 2 final SHA `4543fab1`: SUCCESS
- Cycle 3 final SHA `4c148803`: SUCCESS
- Cycle 4 release SHA `cc8f17be`: SUCCESS
- Cycle 5 release SHA `51a825f5`: SUCCESS
  (Các SHA giữa bị superseded bởi concurrency group — đã verify)

Vercel deployment state cho mỗi commit: SUCCESS (per `gh api repos/.../deployments`).

## /qa via tmux + wclaude (5 lần)

| Run | Cycle           | SHA      | Health | Receipt                             |
| --- | --------------- | -------- | ------ | ----------------------------------- |
| 1   | 1               | c61db730 | 15/100 | local QA receipt, not repo-retained |
| 2   | 1 (post-deslop) | fec49ecd | 15/100 | local QA receipt, not repo-retained |
| 3   | 2               | fc832e25 | 8.5/10 | local QA receipt, not repo-retained |
| 4   | 3               | 60543ab8 | 8/10   | local QA receipt, not repo-retained |
| 5   | 4               | 1.2.0.1  | 8/10   | local QA receipt, not repo-retained |
| 6   | 5               | 1.2.0.2  | 8.5/10 | local QA receipt, not repo-retained |

**Tất cả health < 10 đều do CÙNG MỘT lý do**: Vercel alias `app.comtammatu.com` chưa được promote; mã đã land nhưng chưa được serve cho user.

## Tmux+wclaude pattern (theo directive của owner)

```bash
tmux new-session -d -s qa-c61db730 -c /Users/nguyennghia/go/src/github.com/personal/comtammatu
tmux send-keys -t qa-c61db730 'cat /tmp/qa-prompt.txt | wclaude -p > /tmp/qa-out.log 2>&1; echo "DONE exit=$?" > /tmp/qa-done.flag' Enter
```

- `wclaude` alias: `CLAUDE_CONFIG_DIR="$HOME/.claude-work" claude --plugin-dir ~/go/src/github.com/compass/rnd/nghia-claude-skill --dangerously-skip-permissions`
- `wclaude -p` chạy headless và in kết quả ra stdout, exit khi xong.
- Đã thử cả `tmux new-session -d -s arch2 'wclaude -p ...'` (one-shot) nhưng shell non-interactive không source `~/.zshrc` nên alias không khả dụng. Chỉ nên dùng `send-keys` vào shell interactive.

## 4 named regression rules thêm vào `tasks/regressions.md`

1. **SECURITY-HEADERS-IN-NEXT-CONFIG** — `next.config.ts` MUST emit 6 headers + `poweredByHeader: false` (extended ở cycle 3 với HSTS preload).
2. **FEEDBACK-THANK-YOU-MUST-NOTFOUND-INVALID** — `/r/[token]/thank-you` MUST validate token + check `is_active=true` trước khi render branded card.
3. **FEEDBACK-AFTER-NOT-FIRE-AND-FORGET** — telegram-flush + AI enrichment MUST dùng `after()` từ `next/server`.
4. **FEEDBACK-PHOTO-PATHS-CONDITIONAL-UPDATE** — update photo_paths MUST chain `.or("photo_paths.is.null,photo_paths.eq.{}")` + `.select("id")`.

Mỗi rule có `Detect:` heuristic (grep pattern) để CI hoặc reviewer kiểm chứng.

## 4 source-text regression tests thêm vào `packages/shared/src/feedback/__tests__/regressions.test.ts`

1. `actions-photos.ts updates photo_paths with the conditional .or() guard` — locks rule 4.
2. `/r/[token]/thank-you/page.tsx 404s for invalid or inactive tokens` — locks rule 2 (regex tightened ở cycle 2 follow-up).
3. `actions.ts uses after() (not fire-and-forget) for telegram-flush + AI enrich` — locks rule 3.
4. `next.config.ts emits all security headers + disables X-Powered-By` — locks rule 1.

Plus 1 test cho ISSUE-008 (typed-too-few vs sanitize-stripped) trong `schemas.test.ts`.

## Owner action checklist (chặn cho releases user-visible)

- [ ] **Promote build ≥ `610123c8` lên `app.comtammatu.com` Vercel alias.** Sau khi promote, cả 21 commit + tag `1.2.0.1` + tag `1.2.0.2` đều live cùng lúc.
- [ ] **Confirm 6 prod env vars trên Vercel:** `TELEGRAM_BOT_TOKEN`, `CRON_SECRET`, `ALLOWED_ORIGINS_FEEDBACK` (giờ fail-closed!), `IP_HASH_SALT`, `NEXT_PUBLIC_APP_URL`, `ANTHROPIC_API_KEY`. Nếu `ALLOWED_ORIGINS_FEEDBACK` rỗng → mọi public-feedback submit return 403.
- [ ] **Audit HTTP-only subdomains của `*.comtammatu.com`** TRƯỚC khi đăng ký HSTS preload list. `includeSubDomains; preload` khó undo (de-listing mất hàng tuần).
- [ ] **Re-run `/qa`** sau khi alias được promote — kỳ vọng health flip từ 8/10 (alias-bound) sang true post-deploy verdict, có thể submit HSTS preload list ngay sau đó.
- [ ] **Smoke test post-promote:**
  ```bash
  curl -sI https://app.comtammatu.com/login | grep -iE "x-powered|content-security|x-frame|strict-transport"
  curl -s -o /dev/null -w "%{http_code}" https://app.comtammatu.com/r/THIS-IS-NOT-A-REAL-TOKEN/thank-you  # phải là 404
  curl -s https://app.comtammatu.com/.well-known/security.txt
  curl -s https://app.comtammatu.com/robots.txt
  ```

## Files đã tạo/sửa

### Code

- `apps/web/next.config.ts` — sửa 2 lần (cycle 1 + 3)
- `apps/web/app/r/[token]/actions.ts` — sửa 2 lần (cycle 1 + cycle 1 deslop + cycle 2)
- `apps/web/app/r/[token]/actions-photos.ts` — sửa 1 lần (cycle 1) + deslop
- `apps/web/app/r/[token]/thank-you/page.tsx` — sửa 1 lần (cycle 1)
- `apps/web/app/admin/feedback/page.tsx` — sửa 1 lần (cycle 1)
- `apps/web/app/robots.ts` — TẠO MỚI (cycle 5)
- `apps/web/public/.well-known/security.txt` — TẠO MỚI (cycle 5)
- `packages/shared/src/feedback/schemas.ts` — sửa 1 lần (cycle 1)
- `packages/shared/src/feedback/__tests__/schemas.test.ts` — sửa 1 lần (cycle 1)
- `packages/shared/src/feedback/__tests__/regressions.test.ts` — TẠO MỚI cycle 2 + extended cycle 2/3

### Docs

- `VERSION` — 2 lần (1.1.0.0 → 1.2.0.1 → 1.2.0.2)
- `CHANGELOG.md` — 2 entries thêm vào ([1.2.0.1] + [1.2.0.2])
- `docs/releases/1.2.0.1.md` — TẠO MỚI (113 dòng)
- `docs/releases/1.2.0.2.md` — TẠO MỚI (72 dòng)
- `docs/releases/ralph-session-2026-05-09.md` — TẠO MỚI (file này)
- `tasks/todo.md` — đánh dấu 9 ISSUE shipped
- `tasks/regressions.md` — thêm 4 named rules
- `.omc/prd.json` — viết lại 5 lần (1 PRD per cycle)
- `.omc/progress.txt` — accumulated session log

## Lessons (bổ sung cho `tasks/lessons.md`)

1. **Stale local node_modules.** Cycle 1 đầu gặp typecheck errors trên main mà CI lại pass. Reinstall (`pnpm install --frozen-lockfile`) + clear `.next` cache giải quyết. Khi local build fail nhưng CI green cùng SHA, kiểm tra đầu tiên là dep install.
2. **`tmux send-keys` với shell interactive vs `tmux new-session 'cmd'`.** Cmd-style không source `~/.zshrc` → alias `wclaude` không khả dụng. Luôn dùng `send-keys` với shell interactive.
3. **Vercel "Production" environment ≠ alias promotion.** GitHub deployments API có thể báo `state: success` cho mỗi build trong khi alias `app.comtammatu.com` vẫn pin vào build cũ. Promotion là một step manual riêng owner phải bấm trên dashboard.
4. **Source-text regression tests are format-sensitive.** Một Prettier reformat của `next.config.ts` có thể vỡ `/key:\s*"X-Frame-Options",\s*value:\s*"DENY"/` regex. Đã document trong `tasks/regressions.md` để future maintainer biết.
5. **Architect rejection có thể chỉ là format.** Cycle 5 cycle bị reject vì release notes 55 dòng (dưới floor 60 tự đặt). Fix bằng cách extend notes thay vì hạ floor — kỷ luật nhỏ này giữ cho các cycle sau cũng có notes ≥ 60 dòng.

## Closing

Toàn bộ engineering work đã land trên `main`, mọi gate đều xanh, mọi tag đã push. Phần còn lại nằm ngoài scope agent: **owner promote Vercel alias** + **owner audit HTTP-only subdomains** + **owner re-run smoke test post-promote**. 21 commit và 2 release sẽ go live đồng thời ngay khi alias được flip.
