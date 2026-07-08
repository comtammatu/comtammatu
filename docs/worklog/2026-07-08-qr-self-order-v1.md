# QR Table Ordering V1 Worklog

> Reconciled-through 23500913b

## Review Tier

T3. The change touches public API, schema/RPC, POS, payment, HĐĐT buyer payload, and realtime behavior.

## Skill Plan

- Repo rules loaded: engineering, skills, database, UI, workflow, team, orchestration, references.
- External skill used: Supabase, for current RLS/migration guidance.
- Next.js app-router guidance used for async route params and route handler shape.
- CodeGraph was refreshed before source lookup and must be refreshed again after edits.

## Multi-Agent Findings

- PM: V1 is table-token intake, first staff approval, then order-bound append. No latest-order inference.
- BA: stable states are pending approval, staff target required, active order-bound session, append blocked by pending VietQR, closed after paid/terminal order state.
- Senior Dev: use additive migration, narrow public service RPCs, POS approval RPC, defer QR admin UI.
- QA/Security: public routes must not expose broad DB authority; pending VietQR cancel plus append must be atomic; HĐĐT no-buyer fallback stays server-owned.

## Decisions

- Store the V1 table token on `public.tables.self_order_token`, with enable and rotation metadata.
- Keep the durable customer session bound to `order_id` after approval; the public QR token only resolves the session.
- Public writes go through service-role route handlers calling narrow token-scoped RPCs.
- Staff approval goes through authenticated RPC and reuses existing `create_order` / `append_order_items` semantics.
- Public cart payload is canonicalized in SQL before storage/application so client names/prices are not trusted.
- Self-order payment request carries `cancelled`; linked `payments` row uses existing `failed` status on cancellation so SePay matching keeps ignoring cancelled QR attempts.
- Public client subscribes only to `self-order:<token>` broadcast event `session_changed` and polls as fallback.

## Verification Plan

- Run CodeGraph refresh after edits.
- Run `corepack pnpm typecheck`.
- Run `corepack pnpm lint`.
- Run `corepack pnpm build`.
- Run targeted shared auth tests for public route allowlist.
