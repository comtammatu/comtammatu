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
- Do not copy the standalone app styling or mascot-specific UI classes into `comtammatu`; public UI maintenance must follow the frozen runtime contract, while UX rebuild needs a new owner-approved authority reset first.
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
