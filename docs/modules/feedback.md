# Feedback Module (QR Wave 1)

## Overview

Branch-scoped customer feedback via printed QR codes. Guests submit rating
(required) and optional comment through a public token URL. Owner and Branch
Manager read the inbox and manage QR codes. Wave 1 has no phone, photos,
Telegram, AI enrichment, or daily reports.

**Owner surfaces:** `/feedback` (inbox), `/feedback/qr`  
**Branch surfaces:** `/br/[branchId]/feedback`, `/br/[branchId]/feedback/qr`  
**Public:** `/r/[token]`, `POST /api/feedback/[token]`

## Invariants

- Guest mutations go through `POST /api/feedback/[token]` only. The route uses
  the service-role client to call `submit_feedback`. Direct `anon` /
  `authenticated` EXECUTE on the RPC is revoked.
- Token format is exactly 14 chars `[A-Za-z0-9_-]`. Invalid or inactive tokens
  404. Central sites (`branch_kind <> 'branch'`) and inactive branches reject
  submit.
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

Public prefixes: `/r`, `/api/feedback` in `PUBLIC_APP_PATHS`.

## Schema

- `feedback_qr_codes` — token, branch, optional table, label, `is_active`
- `feedbacks` — rating 1–5, optional comment ≤2000, `client_submission_id`
- `feedback_rate_buckets` — ephemeral rate windows
- `submit_feedback(token, client_submission_id, rating, comment, ip_hash)` —
  `SECURITY DEFINER`, `search_path ''`, service_role only

## Out of scope (Wave 1)

`/admin/feedback`, phone / masked-phone view, photos/storage, Telegram,
AI categories/reports, Google Review routing, order snapshots, `is_suspect`,
durable IP hash on feedback rows, Upstash limiters, shared
`packages/shared/src/feedback` barrel.

## Related

- Auth routing: `packages/shared/src/auth/*`
- Public security mirror: `apps/web/lib/self-order/request-security.ts`
- Dropped predecessor: `supabase/migration-archive/20260609230843_drop_customer_response_module.sql`
