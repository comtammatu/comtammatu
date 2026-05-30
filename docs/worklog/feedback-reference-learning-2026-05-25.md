# Feedback Reference Learning - 2026-05-25

> Scope: learn from `~/matu-feedback` and `~/matu-platform`, then compare against the current `comtammatu` feedback module.
> Workflow: documentation-only learning note, so the 4-agent debate is skipped per `docs/agent/rules/workflow.md`.
> Workspace note: the worktree was already dirty. This note adds documentation only and does not touch product code or existing modified KDS/POS work.

## Verdict

`comtammatu` should not replace its current QR feedback foundation with either reference repo.

The useful learning is narrower:

- From `~/matu-feedback`: adopt the public sentiment split: satisfied customers go to Google review, unsatisfied customers enter the internal management intake.
- From `~/matu-platform`: adopt the idea that review-link/config belongs to the Feedback product configuration surface, not deployment env.
- From current `comtammatu`: keep the stronger security and operations model: QR token validation, RPC-only writes, host isolation, private photo bucket, Telegram outbox, AI enrichment, masked phone view, and ACL-gated admin inbox.

## Current `comtammatu` Baseline

Current module already has:

- Public customer route: `/r/[token]`.
- Admin route family: `/admin/feedback`, `/admin/feedback/qr`, `/admin/feedback/settings`, `/admin/feedback/reports`.
- Tables: `feedback_qr_codes`, `feedbacks`, `telegram_destinations`, `telegram_outbox`, `feedback_settings`, `feedback_daily_reports`.
- Submission path: client form -> Server Action -> `submit_feedback` SECURITY DEFINER RPC.
- Guardrails: token format validation, active-token lookup, honeypot, production origin allowlist, token/IP rate limits, no raw Supabase error messages to client.
- Photos: private `feedback-photos` bucket, signed admin URLs, path convention `<tenant_id>/<feedback_id>/<filename>`.
- Ops: Telegram alert queue, AI enrichment, daily reports, retention cleanup.
- Access: proxy route ACL, module ACL, RLS, masked phone view.

Open feedback hardening items still tracked in `tasks/todo.md`:

- Photo upload IDOR tokenization.
- Branch-tight photo storage RLS.
- Storage-object cleanup in retention.
- Extra permission check in `getFeedbackPhotoUrls`.
- Tenant-wide inbox index.
- Shared-table order snapshot quality.

## Learning From `~/matu-feedback`

Useful:

- Public entry should ask one simple question first: `Hài Lòng` vs `Chưa Hài Lòng`.
- `Hài Lòng` is a review-conversion path, not an internal feedback path.
- `Chưa Hài Lòng` reveals the internal form and uses management-oriented copy such as `Gửi Quản Lý`.
- The Google review URL is read from the feedback form schema/config, not from `.env`.
- Missing Google review config should be treated as a configuration gap. Do not invent a generic Google Maps fallback.
- Rating questions are ordered first to create a low-friction first commitment.

Do not copy:

- Do not return raw Supabase error details to the browser. `comtammatu` forbids this.
- Do not use public storage URLs for feedback photos. `comtammatu` already uses a private bucket and signed URLs.
- Do not copy the standalone app styling or mascot-specific UI classes into `comtammatu`; public UI must follow the project design-system contract.
- Do not move `comtammatu` to anon direct inserts. Current RPC-only write path is safer.

## Learning From `~/matu-platform`

Useful:

- It models a Feedback form as product-owned config: title, slug, optional branch, active flag, `schema.questions`, and `schema.googleReviewUrl`.
- The admin builder validates the JSON schema through Zod before writing to DB.
- The public URL builder centralizes the public feedback domain/path.
- Responses are separated from form definitions, which enables custom forms and a generic response inbox.
- Branch ownership is checked before assigning a form to a branch.

Do not copy:

- Do not copy raw `error.message` returns from its form actions.
- Do not copy UUID/citext/schema assumptions into `comtammatu`, which currently uses BIGINT public tables and project-specific ACL/RLS helpers.
- Do not import the generic form-builder scope unless `comtammatu` explicitly decides to support custom survey forms. Current QR feedback is a fixed operational complaint/review flow.

## Recommended Adaptation For `comtammatu`

### Slice 1 - Review Conversion Gate

Add a first-screen gate to `/r/[token]`:

- `Hài Lòng`: open the configured Google Maps review URL for that branch.
- `Chưa Hài Lòng`: reveal the existing internal feedback form.
- Internal submit CTA: change from `Gửi phản ánh` to `Gửi Quản Lý`.
- Keep current validation, honeypot, rate limits, RPC, Telegram, AI, photo path, and thank-you redirect.

Configuration should live inside Feedback-owned data, not env. Because `comtammatu` QR tokens are branch/table based, the likely fit is branch-scoped feedback review config, with a tenant default only if the owner confirms one shared Google listing.

Do not implement a generic Google Maps search fallback. If no review URL is configured, the positive path should clearly surface that the review link is not configured.

### Slice 2 - Admin Config Surface

Extend `/admin/feedback/settings` or a branch-scoped Feedback settings sub-surface to manage:

- Google review URL per branch.
- Optional tenant default review URL.
- Preview/copy of the public review conversion behavior.

Keep Server Action validation with Zod, sanitize all returned errors, and preserve ACL through `feedback:manage_settings` or a branch-aware equivalent.

### Slice 3 - Optional Future Form Builder

Only consider a `matu-platform`-style custom form builder after a separate product decision.

It would require a new contract, not a small port:

- New form-definition table or JSON config model.
- New response storage if answers become dynamic.
- Migration from fixed `feedbacks.comment/rating/phone/photo_paths` into either fixed columns plus `answers` or a separate response table.
- Admin inbox changes to summarize dynamic answers.
- Reporting/AI taxonomy changes.

For the current restaurant pilot, this is not the next obvious step.

## Implementation Guardrails

If implementation starts later:

- Read `docs/spec/design-system.md` before UI changes.
- Run the required 4-agent debate because this becomes a feature change.
- Keep public host isolation in `apps/web/proxy.ts`; do not create a second host gate.
- Keep writes RPC-only for customer submissions.
- Keep phone masking and signed photo URLs.
- Keep scope in URL/DB, never localStorage or React Context.
- Run `pnpm typecheck && pnpm lint && pnpm build` before marking the implementation complete.

## T3 Implementation Contract - 2026-05-28

Scope: implement Slice 1 review conversion gate and Feedback-owned Google review URL config on top of the existing `/r/[token]` QR/RPC flow. This is T3 because it includes a schema migration and changes the public customer path.

PM: Build only the first useful migration slice. Acceptance is: happy customers can leave through the configured Google review URL, unhappy customers enter the existing internal form, missing review config is explicit, and the current feedback security/ops path remains unchanged.

BA: The review URL belongs to Feedback settings data, not deployment env. Positive flow must not create an internal feedback row. Negative flow must preserve required rating/comment/phone/photo behavior, Telegram/AI follow-up, and thank-you redirect after submit.

Senior Dev: Add a nullable `google_review_url` column to `feedback_settings`; keep public submission writes RPC-only. Fetch the tenant setting from the public token page using the service client after token validation. Extend existing settings action/schema/UI rather than introducing a generic form-builder port.

QA/QC: Cover settings schema normalization/validation and source-level regression for the sentiment gate/CTA. Verify typecheck, lint, build, and targeted shared feedback tests. Re-check that no raw Supabase error is returned and no generic Google fallback is introduced.

## T3 Implementation Contract - 2026-05-28 - Slice 2

Scope: extend review conversion config from tenant-default only to branch-scoped override with tenant fallback. This stays inside the existing QR/RPC feedback module and does not introduce a generic form builder.

PM: Each branch can carry its own Google review URL because printed QR tokens are branch/table based. The tenant default remains useful for cold start and for branches without a specific listing.

BA: Public `/r/[token]` resolves the QR first, then picks `feedback_branch_review_settings.google_review_url` for that branch; if absent or blank, it falls back to `feedback_settings.google_review_url`; if both are absent, the happy path surfaces a configuration gap.

Senior Dev: Add a Feedback-owned branch review settings table keyed by tenant and branch. Keep RLS enabled, grant only authenticated app access, validate URLs with the shared HTTPS schema, and wire owner-only Server Actions into `/admin/feedback/settings`.

QA/QC: Add schema tests for branch URL updates and regression coverage that public token pages prefer branch config while preserving tenant fallback. Re-run DB types after applying to the verified dev project, then run shared tests plus `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

## T2 Self-Review - 2026-05-28 - QR Preview/Copy

PM: Finish the admin-config slice by making each QR row operationally usable after review-link setup. Acceptance is that owner can copy/open the public QR URL and see whether the happy path uses branch link, tenant default, or is not configured.

BA: Public URL preview must use the feedback host when configured, then app URL fallback. Review status is display-only and must not change QR token, branch, or submission behavior.

Senior Dev: Compute public URLs and review-link source in the QR server page, pass them to the existing client table, and add small Button/Badge controls. No new table, no form builder, no client env reads.

QA/QC: Add a source regression that QR management exposes public URL copy/open behavior and review-link source status. Run shared feedback tests plus the required typecheck/lint/build gates.

## T3 Implementation Contract - 2026-05-28 - Inbox Index/Photo Permission

Scope: close the small remaining Feedback hardening pair from the QA backlog: tenant-wide inbox query index and defense-in-depth permission check before signed photo URLs. This is T3 because it adds a database migration.

PM: Do not expand scope into custom forms or photo-tokenization in this slice. Acceptance is: inbox tenant-wide reads have a direct `(tenant_id, created_at DESC)` index, and the dead-but-dangerous photo URL helper cannot mint signed URLs without authenticated `feedback:view` access.

BA: Photo signing must be tenant-bound and branch-permission-bound. A caller must not be able to pass another tenant id or a feedback id from a branch they cannot view. Invalid or missing rows return a neutral product error, not raw Supabase details.

Senior Dev: Add one B-tree index migration on `feedbacks`; leave existing branch index intact. In `getFeedbackPhotoUrls`, authenticate first, bind tenant id to JWT claims, read branch id with the service client, probe `feedback:view` for that branch, then sign only paths matching the expected feedback path prefix.

QA/QC: Add source regressions for the permission gate and the inbox index migration. Apply migration to verified dev only, regenerate DB types, then run shared feedback tests plus typecheck/lint/build.


## T3 Implementation Contract - 2026-05-28 - Retention Photo Cleanup Queue

Scope: close Feedback ISSUE-005 by making retention row deletion enqueue associated photo paths for Storage API deletion. This is T3 because it adds a table and replaces a SECURITY DEFINER cleanup RPC.

PM: Keep scope to row-deletion photo cleanup; do not fold in upload-tokenization or branch-tight photo RLS. Acceptance is that rows deleted by retention no longer lose their photo paths without a cleanup trail, and cron can remove queued objects through Storage API.

BA: SQL must not delete `storage.objects` directly. Storage deletion is best-effort and retryable; if Storage API fails, the queue row remains for a later cron. Return safe counts only.

Senior Dev: Add a service-role cleanup queue table, update `feedback_retention_cleanup()` to enqueue paths before deleting expired feedback rows, then update the cron route to process pending queue rows with `.remove()` and mark `processed_at`.

QA/QC: Add source regression proving the RPC queues `photo_paths`, the cron route uses Storage API remove, no direct `DELETE FROM storage.objects` exists, and the queue tenant FK has a covering index. Apply to verified dev only, run `db:types`, shared tests, typecheck, lint, and build.

## T3 Implementation Contract - 2026-05-28 - Photo Upload One-Shot Token

Scope: close Feedback ISSUE-002 by binding public photo uploads to a one-shot upload token minted by the `submit_feedback` RPC. This is T3 because it changes schema and replaces a SECURITY DEFINER RPC used by the public feedback path.

PM: Keep scope to post-submit photo upload ownership. Do not fold in branch-tight storage RLS or shared-table order snapshot cleanup. Acceptance is: a customer can upload photos immediately after their own submit, but cannot attach photos to another recent feedback id with only QR token and guessed id.

BA: The raw upload token is returned once to the submitting browser and never stored in plaintext. DB stores only SHA-256, expiry, and consumed timestamp. Token is single-use, expires quickly, and failed DB linking should not leave successful uploads permanently orphaned.

Senior Dev: Add nullable upload-token columns to `feedbacks`, replace `submit_feedback` return with JSONB containing `feedback_id` plus token, preserve M5 dish-name warning behavior, require token hash/expiry/consumed checks in `uploadFeedbackPhotos`, and consume token atomically with `photo_paths` update.

QA/QC: Add source regression for token minting, hashing, one-shot consume, and Storage cleanup on race loss. Apply to verified dev only, regenerate types, run shared tests plus typecheck/lint/build, and re-check advisors for new warnings.

## T3 Implementation Contract - 2026-05-28 - Branch-Tight Feedback Photo Storage RLS

Scope: close Feedback ISSUE-004 by tightening the authenticated SELECT policy on the private `feedback-photos` bucket. This is T3 because it changes Storage RLS.

PM: Keep scope to Storage RLS defense-in-depth. Do not change public upload path, signed URL flow, or order snapshot logic. Acceptance is that an authenticated user can only directly read/list feedback photo objects for feedback rows in their tenant and branches where they have `feedback:view`.

BA: Existing paths are `<tenant_id>/<feedback_id>/<filename>`, so the policy must map path segment 1 to tenant and segment 2 to feedback id. Invalid or malformed object paths should deny by default. Service-role upload/delete and signed URL creation remain server-side.

Senior Dev: Replace `feedback_photos_authenticated_select` with a single policy that keeps `bucket_id='feedback-photos'`, tenant path match, safe numeric feedback-id parsing, and an `EXISTS` join to `public.feedbacks` with tenant id and `public.has_permission(f.branch_id, 'feedback:view')`. Keep service-role all policy unchanged.

QA/QC: Add source regression for the tightened Storage RLS policy. Apply to verified dev only, run `pnpm db:types` after the dev apply, then run shared feedback tests plus typecheck/lint/build and advisors.

Verification note: Local migration and regression were added on 2026-05-28. Dev apply to project `iexwsuaqqenyjiskawoj` is blocked through both Supabase MCP migration apply and `supabase db query --linked` because `storage.objects` is owned by `supabase_storage_admin`; the current SQL channel runs as `postgres` and receives `must be owner of relation objects`. Remote dev policy was re-read after the failed apply and remains the older tenant-only predicate.

Owner apply path: apply `supabase/migrations/20260602004000_feedback_photos_branch_rls.sql` through a Supabase Storage policy editor or SQL channel that runs as `supabase_storage_admin` or another owner-capable role. Do not apply it to production directly from an agent session. After apply, verify:

```sql
SELECT pol.polname, pg_get_expr(pol.polqual, pol.polrelid) AS using_expr
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
JOIN pg_namespace ns ON ns.oid = cls.relnamespace
WHERE ns.nspname = 'storage'
  AND cls.relname = 'objects'
  AND pol.polname = 'feedback_photos_authenticated_select';
```

The expression must contain `public.feedbacks`, safe numeric parsing for path segment 2, and `public.has_permission(f.branch_id, 'feedback:view')`.

## T3 Implementation Contract - 2026-05-28 - Unambiguous Feedback Order Snapshot

Scope: close Feedback ISSUE-011 by making `submit_feedback` avoid wrong `order_id_snapshot` attribution when a physical table has multiple active unpaid POS orders. This is T3 because it replaces the public feedback SECURITY DEFINER RPC.

PM: Keep scope to snapshot quality. Do not add customer order selection UI, new QR token shape, or schema columns. Acceptance is that single-order tables still get order total and dish snapshots, while multi-order tables no longer attach feedback to an arbitrary latest order.

BA: A table QR identifies the table, not the exact bill. With multi-order-per-table enabled, choosing the newest order creates misleading management data. Ambiguous snapshots should be empty rather than wrong, with a warning for ops visibility.

Senior Dev: Replace the latest-order query with an active-unpaid count. Only when count equals 1 should the RPC populate `order_id_snapshot`, `order_total_snapshot`, and `dish_names_snapshot`; when count is greater than 1, leave them null and raise a warning. Preserve one-shot photo token return and M5 dish-name warning behavior.

QA/QC: Add source regression that the latest-order heuristic cannot return, the query excludes paid orders, and ambiguity emits a warning. Apply to verified dev only, run shared feedback tests plus typecheck/lint/build, and confirm the remote function body contains the unambiguous count path.

Verification note: Applied to dev project `iexwsuaqqenyjiskawoj` on 2026-05-28. Remote `submit_feedback` still returns `jsonb`, contains the active-order count path, excludes paid orders, emits the ambiguous snapshot warning, and preserves the one-shot photo token plus dish-name warning behavior. Generated DB types were refreshed after the apply.
