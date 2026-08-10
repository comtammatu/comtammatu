# Feedback Module (QR Wave 1 + 1.1 + 1.2)

## Overview

Branch-scoped customer feedback via printed QR codes and Self-Order after
payment. Guests submit rating (required) and optional comment (required when
rating is 1–3). Owner and Branch Manager read the inbox and manage QR codes.
Wave 1.1 adds order-anchored Self-Order submit with snapshot fields. Wave 1.2
routes after submit: rating >= 4 opens Google Review when
`branches.google_review_url` is set; rating <= 3 shows `tel:` to
`branches.phone`. Still no guest phone capture, photos, Telegram, AI, or call
staff/manager button.

**Owner surfaces:** `/feedback` (inbox), `/feedback/qr`, `/branches` (Google
Review URL on branch form)  
**Branch surfaces:** `/br/[branchId]/feedback`, `/br/[branchId]/feedback/qr`  
**Public:** `/r/[token]`, `POST /api/feedback/[token]`  
**Self-Order:** CTA on payment-completed `/q/[token]` →
`POST /api/self-order/[token]/feedback`

## Invariants

- Guest QR mutations go through `POST /api/feedback/[token]` only. The route
  uses the service-role client to call `submit_feedback`. Direct `anon` /
  `authenticated` EXECUTE on the RPC is revoked.
- Guest Self-Order mutations go through
  `POST /api/self-order/[token]/feedback` → `submit_self_order_feedback`
  (service_role only). Order must belong to the self-order table and be
  `payment_status = 'paid'`. At most one feedback row per `order_id`.
- Self-Order path keeps `qr_code_id` NOT NULL: prefer active table-linked QR,
  else active branch-wide QR; missing QR rejects with `feedback_qr_required`.
- Standalone `/r/{token}` submissions leave order snapshot columns NULL.
- After successful submit: rating >= 4 + configured Google URL → external
  Maps/Review CTA; rating <= 3 + branch phone → `tel:` CTA. Missing URL/phone
  shows thanks only.
- Low ratings (1–3) require a non-empty comment in guest UI before submit.
- QR token format is exactly 14 chars `[A-Za-z0-9_-]`. Invalid or inactive
  tokens 404. Central sites (`branch_kind <> 'branch'`) and inactive branches
  reject submit.
- Idempotency: unique `(qr_code_id, client_submission_id)`. Retries return the
  existing row.
- Rate limits live in `feedback_rate_buckets` inside the RPC (token and
  token+IP scopes). Raw IP is never stored; the API passes an HMAC hash only.
- Staff reads/writes use RLS + `has_permission(branch_id, key)`. Owner bypasses
  via `auth_is_owner`. Branch Manager is branch-scoped.
- Composite ownership: a table-linked QR must reference a table in the same
  tenant and branch. At most one active QR per table.
- Staff QR list offers copy public URL and download PNG for print; both use the
  same `/r/{token}` payload.
- Inbox shows order snapshot when present: order number, table, order opened
  time.
- `branches.google_review_url` is Owner-edited via `/branches` (`settings:tenant`).

## Permission keys

| Key | Scope | Delegable | Roles (Wave 1) |
| --- | --- | --- | --- |
| `feedback:view` | branch | yes | owner, branch_manager |
| `feedback:manage_qr` | branch | yes | owner, branch_manager |

## ACL modules

| ModuleKey | Path | Roles |
| --- | --- | --- |
| `feedback` | `/feedback` | owner |
| `branch_feedback` | `/br/*/feedback` | owner, branch_manager |

Public prefixes: `/r`, `/api/feedback`, `/q`, `/api/self-order` in
`PUBLIC_APP_PATHS`.

## Schema

- `feedback_qr_codes` — token, branch, optional table, label, `is_active`
- `feedbacks` — rating 1–5, optional comment ≤2000, `client_submission_id`,
  nullable order snapshot (`order_id`, `order_number`, `table_id`,
  `table_number`, `order_created_at`)
- `feedback_rate_buckets` — ephemeral rate windows
- `branches.google_review_url` — nullable https URL ≤500
- `submit_feedback(token, client_submission_id, rating, comment, ip_hash)` —
  `SECURITY DEFINER`, `search_path ''`, service_role only
- `submit_self_order_feedback(token, order_id, client_submission_id, rating,
  comment, ip_hash)` — same security posture; fills order snapshot
- `self_order_get_snapshot` branch payload:
  `{ name, phone, googleReviewUrl }`

Migrations:

- `supabase/migrations/20260810123000_self_order_feedback_order_snapshot.sql`
- `supabase/migrations/20260810124502_branch_google_review_url.sql`

## Out of scope (still deferred)

`/admin/feedback`, guest phone capture / masked-phone view, photos/storage,
Telegram, AI categories/reports, call staff/manager button, BM edit of
`google_review_url`, forcing order on standalone QR, `is_suspect`, durable IP
hash on feedback rows, Upstash limiters, shared
`packages/shared/src/feedback` barrel.

## Related

- Auth routing: `packages/shared/src/auth/*`
- Public security mirror: `apps/web/lib/self-order/request-security.ts`
- Dropped predecessor: `supabase/migration-archive/20260609230843_drop_customer_response_module.sql`
