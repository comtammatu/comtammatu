# Toast And Notification System

> Status: design and producer contract | Updated: 2026-08-20 | Scope: app-wide transient toast, durable in-app notifications, foreground PWA popup, external notification outbox, and boundary vs operational audio

## UI Scope Declaration

- Surface: all authenticated web surfaces plus operational POS/KDS surfaces.
- Primary user job: know whether the current action succeeded, failed, needs retry, or created follow-up work.
- Route family: `/*`, `/br/[branchId]/pos`, `/br/[branchId]/kds`, `/br/[branchId]/shift/*`, `/inventory/*`, `/notifications`.
- Change type: behavior and UX contract. Runtime code should follow this contract before adding new notification producers.
- Shared components: `Sonner`, `Button`, `Popover`, `Card`, `ScrollArea`, `Badge`, `Empty`, `Item`, `Tooltip`, and route shells from Má Tư DS shared components.

## Decision

The system has these feedback channels with different durability:

- Toast: short-lived client feedback for the action currently happening on screen. On a visible control-surface route, it is also the transient attention layer for a newly arrived durable notification; the durable row remains the source of truth. Use `toast` from `@comtammatu/ui/components/sonner`.
- In-app notification: durable, role/branch-scoped work item stored in `public.notifications`, read state in `public.notification_reads`, and surfaced through `/notifications`, `Cổng nhân viên`, or an approved bell/entry point.
- Foreground popup: device-level OS notification fired by the open PWA via the `Notification` API for new unread durable notifications the user can see, across `info`, `warning`, and `critical`. A visible control-surface route uses Sonner instead to avoid duplicate foreground alerts. A visible POS/KDS/pickup route mutes durable Sonner and OS popup so the live board owns attention; backgrounded floor tabs still use the OS popup. The OS popup links back to `/notifications` or the action URL and fires only while the app is open; there is no closed-app delivery.
- External outbox: `public.notification_outbox` is retained but unused. There is no worker (no FCM, email, or Telegram). Producers must not enqueue `pending` rows; leftover pending is `skipped`.
- Operational audio (POS/KDS): device-local beep and optional pre-recorded voice on the open board/terminal. Not durable, not role-feed, not Telegram. Contract: `docs/spec/operational-audio-alerts.md`.

Do not collapse these channels. A toast is not an audit trail. An in-app notification is not a replacement for immediate form feedback. The foreground popup is only an attention layer over durable notifications. The external outbox is not the unread feed. Operational audio is not a notification row and must not be routed through `public.notifications`.

## Authority

Use these sources in order:

1. Runtime UI contract: `docs/spec/design-system.md`
2. Toast primitive: `packages/ui/src/components/sonner.tsx`
3. Durable feed actions: `apps/web/app/(protected)/notifications/actions.ts`
4. Durable feed UI: `apps/web/app/_components/notification-*`
5. Foreground popup runtime: `apps/web/app/_hooks/use-foreground-notifications.ts`, `apps/web/app/_components/notification-popup-control.tsx`, and `apps/web/app/sw.ts` (notificationclick)
6. Database contract: `supabase/migrations/20260727120000_baseline.sql` (notifications tables) and forward notification migrations
7. External outbox: unused `public.notification_outbox` (no worker; do not enqueue `pending`)
8. Product vocabulary: `docs/ref/glossary.md`, `packages/shared/src/labels/vi.ts`, and domain dictionaries

## Core Model

```text
User action
  -> local validation or Server Action
  -> ActionResult
  -> toast.* for immediate feedback

Workflow event
  -> RPC / trigger / Server Action after permission check
  -> public.notifications row
  -> RLS decides visibility by tenant, role, branch
  -> useNotifications refreshes list + unread count
  -> /notifications, `Cổng nhân viên`, shell entry point, or approved bell

Foreground attention (PWA open)
  -> user grants Notification permission
  -> Realtime INSERT on notifications triggers an RLS-scoped refetch
  -> visible control surface (Owner L0, branch_management, non-POS/KDS
     branch_operation chrome): Sonner toast
  -> visible POS/KDS/pickup: no durable Sonner/OS popup (board owns attention)
  -> backgrounded POS/KDS/pickup tab: Notification API popup via SW
  -> notification click focuses or opens the action URL

Unread / badge freshness
  -> mark-read writes notification_reads
  -> Realtime on notifications + notification_reads refreshes feed and badges
  -> same-tab also emits ctmt:notifications-changed

External delivery
  -> not in product scope (no worker)
  -> do not insert notification_outbox pending rows
```

## PM Scope

MVP: one clear immediate feedback path per client action (inline / toast / blocking dialog); durable notifications for work that survives navigation or needs another role; feed supports unread, mark-read, deep links, severity, expiry, dedup; shared severity semantics without shared storage; foreground OS popups while PWA open only (no closed-app push); producers auditable by kind, entity, target role/branch, dedup key.

Out of scope: native APNs/FCM or channel SDKs; a second visual system outside Má Tư DS/Sonner; per-user notification rows (targeting stays role/branch; read state is per user). PWA install/offline/OS support: `docs/spec/pwa.md`.

## BA Rules

### Use Toast For

- The current user completed a direct action: save, submit, print, export, copy, open shift, close shift.
- A new durable notification arrives while the control surface is visible; the toast is attention only and does not replace unread state.
- Client-side validation caught a correctable issue before calling the server.
- A server action returns a non-critical, user-actionable error message.
- A background side effect soft-failed while the parent action succeeded.
- The next step is local and immediate, such as "choose a table" or "scan again".

### Use In-App Notification For

- Approval, exception, escalation, SLA, or handoff work.
- Another role or branch must take action.
- The event should be visible after reload, across devices, or to multiple authorized users.
- The event must link to a business entity such as order, GRN, transfer, stocktake, supplier return, credit note, staff task, or period close.
- The event needs unread state or later reconciliation.

### Use External Outbox For

- A third-party channel must receive the event.
- A manager expects off-app alerts.
- Delivery may fail and needs retry/failed/skipped status.
- The external channel should receive a compact payload, not the full in-app UI model.

## Decision Matrix

| Scenario                                      | Toast                                     | In-app notification                              | External outbox                      |
| --------------------------------------------- | ----------------------------------------- | ------------------------------------------------ | ------------------------------------ |
| Form saved by current user                    | Yes                                       | No                                               | No                                   |
| Client validation fails                       | Yes or inline field error                 | No                                               | No                                   |
| Payment confirmed                             | Yes                                       | Usually no                                       | Optional only if finance needs alert |
| Auto-waste soft-fails after POS void succeeds | Warning toast                             | Optional task for admin if follow-up is required | Optional                             |
| Stock low recurring alert                     | No unless user triggered check            | Yes with dedup key                               | Optional                             |
| KDS ticket received                           | Usually no toast if visible in live queue | Optional only for cross-station handoff          | No                                   |
| Print job retry failed                        | Error toast for operator                  | Yes for settings/ if repeated                    | Optional                             |

## Severity Contract

Toast and notification severities must mean the same thing:

| Severity | Toast API                               | Notification `severity`        | Meaning                                                          | User expectation                             |
| -------- | --------------------------------------- | ------------------------------ | ---------------------------------------------------------------- | -------------------------------------------- |
| Success  | `toast.success`                         | Not stored as durable severity | Completed action                                                 | No further action unless description says so |
| Info     | `toast.info` or `toast.message`         | `info`                         | Neutral update or normal handoff                                 | Read or open when convenient                 |
| Warning  | `toast.warning`                         | `warning`                      | Action succeeded with risk, delay, exception, or follow-up       | Review soon                                  |
| Critical | `toast.error` for failed current action | `critical`                     | Blocked workflow, SLA breach, hard block, or high-risk exception | Act now                                      |
| Loading  | `toast.loading`                         | Not stored                     | Visible latency                                                  | Wait or cancel if supported                  |

Do not store durable success notifications for routine local actions. They pollute the feed and make real work harder to see.

## Producer And Kind Contract

Every new or modified producer sets trusted `tenant_id`, appropriate `target_branch_id`, `target_roles`, stable `kind`, `severity`, and Vietnamese `title`. It adds entity/action metadata only when the target route is safe and authorized. Repeated, scheduled, retryable, or state-scanning producers require a deterministic `dedup_key`; one-off domain events may use their unique event id or omit the key when duplicate rows represent distinct legitimate events.

Producer creation happens after the domain state is durable. When correctness requires the notification and domain write to commit together, both belong in the same RPC transaction. Money, tax, and labor notifications are alert-only; they never auto-act. Any LLM formatting layer receives selected structured data, has no database/RPC credentials, and may generate prose only.

### Kind Taxonomy

Use stable namespaced `kind` values: `<domain>.<event>`. Existing runtime values are grandfathered. New values use the full domain name when practical and must not create a synonym for an existing event. Runtime labels live in `apps/web/lib/messages/notifications.ts`; icon handling lives in `apps/web/app/_components/notification-item.tsx`. Every new or modified kind must have a user-facing label and intentional icon/fallback behavior.

Do not encode branch, role, severity, or status into `kind`; those belong in dedicated fields or `meta`.

Producer pattern pointer: client actions map `ActionResult` to `toast.*`; server actions return safe Vietnamese `ActionResult.error` (never raw DB messages); RPC-critical producers `INSERT` into `public.notifications` inside the same transaction as the domain write.

## Durable Notification Schema Contract

Required fields for producers:

- `tenant_id`: always from authenticated claims or server-side tenant context.
- `target_roles`: one or more staff roles allowed to see and act.
- `kind`: stable namespaced event key.
- `severity`: `info`, `warning`, or `critical`.
- `title`: short Vietnamese label that identifies the work item.

Conditionally required fields:

- `target_branch_id`: required for branch-local work; `null` only for tenant/tenant work.
- `body`: required when the title alone does not tell the user what changed.
- `entity_type` and `entity_id`: required when the event references a business object.
- `action_url`: required when a safe next-action route exists.
- `dedup_key`: required for repeated or scheduled events.
- `expires_at`: required for time-boxed alerts.
- `meta`: structured details for diagnostics, formatting, or future delivery.

Actionable notifications must set `expires_at` when their entity is resolved or deleted; unread attention must not survive after the work item stops existing.

Recommended `meta` shape:

```ts
type NotificationMeta = {
  branchName?: string;
  actorId?: string;
  actorName?: string;
  entityCode?: string;
  amount?: number;
  currency?: "VND";
  severityReason?: string;
  source?: "rpc" | "server_action" | "scheduled_job" | "external_webhook";
  correlationId?: string;
};
```

## Targeting And Visibility

Visibility is enforced by RLS on `public.notifications`:

- Tenant must match `auth_tenant_id()`.
- Current role must be in `target_roles`.
- Branch must match `target_branch_id`, unless `target_branch_id` is `null` or the role is tenant-wide.

Producer rules:

- Never trust client-provided `tenant_id`, role, or branch targeting.
- Branch-local operational tasks should set `target_branch_id`.
- tenant or tenant-level tasks may set `target_branch_id = null`, but only when all target roles are allowed tenant-wide visibility.
- If multiple branches need the same work item, create one row per branch unless the work is genuinely tenant-level.

## Read State

`public.notification_reads` stores read state by `(notification_id, user_id)`.

Rules:

- Read means "this user acknowledged/visited the item", not "the underlying work is complete".
- Completing the underlying business task must update the business entity, not only mark the notification read.
- Mark-all-read should affect only currently visible notifications.
- A notification may stay unread for one user and read for another user.

## Lifecycle

```text
Created -> Visible unread -> Read by user
       -> Expired (hidden from unread count)
       -> Superseded by newer deduped event
```

Lifecycle rules:

- Creation must happen after the domain state change is durable.
- For multi-item atomic writes, creation belongs inside the same Postgres RPC transaction as the domain write.
- Expiry hides stale alerts from active work views but should not be used to erase audit-relevant events.
- Dedup should update or suppress repeated alerts instead of creating noisy duplicates.
- Deleting notification rows is allowed only for data retention cleanup or tenant deletion cascade.

## Dedup Keys

Use `dedup_key` for noisy events.

| Event              | Dedup key                                           |
| ------------------ | --------------------------------------------------- |
| Stock low          | `inventory.stock_low:{branch_id}:{ingredient_id}`   |
| Stocktake conflict | `stocktake.conflict:{session_id}:{line_id}`         |
| Integration failed | `system.integration_failed:{integration}:{date}`    |
| SLA breach         | `workflow.sla:{entity_type}:{entity_id}:{sla_name}` |

If an event can occur multiple times legitimately, include the domain event id. If repeated rows add no value, keep the dedup key stable and update metadata or rely on `ON CONFLICT`.

Anti-spam: repeated system checks need `dedup_key`; scheduled alerts rate-limit by entity and period; high-frequency operational events update a live view, not the feed; toasts from rapid clicks use pending state or stable id. Defaults: stock low one active per branch+ingredient until replenished; integration failure one per integration per day (`meta` retry count); SLA one per entity+SLA.

## Toast Architecture

```text
Client event -> local validation / Server Action -> ActionResult -> toast.*
Durable notification INSERT -> RLS-scoped refetch -> visible control surface -> toast.*
```

Import `@comtammatu/ui/components/sonner`; root `<Toaster />` in
`apps/web/app/layout.tsx`. Use Sonner variants directly; one-sentence title;
disable pending / stable id against duplicates; no page-local toast containers;
no URL flash for non-auth feedback (`/access-denied?reason=...` stays auth/scope).

Variants: `success` (done), `info`/`message` (hint), `warning` (follow-up),
`error` (retry/correct), `loading` (in progress). Copy names the business
object, never raw DB/RPC text (`PGRST204`, `insert failed`, `Success!`).

## In-App Notification Architecture

```text
Domain event / RPC / server action
  -> insert public.notifications
  -> RLS filters by tenant, role, branch
  -> useNotifications refetches list + unread count
  -> NotificationList renders item rows
```

Runtime: `notifications/actions.ts`; `use-notifications.ts` /
`use-notification-badges.ts`; `notification-list.tsx` / `notification-item.tsx`;
`(protected)/notifications/page.tsx`. Full feed is source of truth; bell/footer
is shortcut. Row click may mark read then navigate `action_url`.

## Surface Placement

- **POS:** toasts for payment/order/print/session; no notification bell on the
  live cart; durable void / out-of-stock follow-up is Branch operator Orders
  (`/br/{id}/orders`).
- **KDS:** live queue primary; toast only mutation feedback; ticket sound =
  operational audio, not durable; no notification bell.
- **Owner:** full feed + module badges; link to review/finance/staff/inventory
  exceptions.
- **Inventory:** durable for stock low, stocktake conflict, approvals; Branch
  requests → central sites; purchase demand → Owner + Accountant; PR/PO →
  purchase queues; GRN → goods-receipt queues.
- **Staff (`Cổng nhân viên` / `/me`):** operator bell + `/notifications`; personal
  leave/checkout results deep-link `/me` (branch floor hydrates to
  `/br/{id}/shift/*`). Not an Owner control surface.

## Domain producer matrix (P0–P1)

Inventory: `procurement.purchase_request_submitted` /
`procurement.po_pending_approval`; `inventory.stock_request_*` /
`inventory.waste_pending_approval` / `workflow.transfer_in_transit`. Finance:
`inventory.valuation_variance` / `inventory.valuation_reconciliation_failed`.
Orders: `pos.void_*`, `pos.kds_out_of_stock`. Do **not** insert `pos.order_new`
— live POS/KDS/self-order boards own new sales. HR: `hr.leave_*`, `hr.checkout_*` /
`attendance.checkout_requested`, `hr.payroll_period_ready`. PO status kinds
`workflow.po_sent` / `workflow.po_approved` / `procurement.po_pending_approval`
use stable `dedup_key` `{kind}:{po_id}` so re-send / re-approve does not create
a second unread row. Closed-app Web Push / APNs / FCM remains out of scope.
Foreground OS popup stays D046: only while the PWA is open.

## External Outbox

`notification_outbox` has no consumer in this repo. Do not enqueue `pending`
rows. The NCC return-slip trigger is a no-op; existing `pending` is marked
`skipped`. Table and status check stay for history. Do not invent FCM, email,
or Telegram dispatchers here.

## Error Handling

Server: log details; return safe Vietnamese `ActionResult.error` (never raw
Supabase/Postgres `error.message`). Client: field errors inline; action-level
toasts; durable notifications only for real workflow obligations. Map RPC/UI
errors in the Server Action — no constraint names/SQLSTATE in toast/body.

## Security And Privacy

RLS is the visibility boundary. Never put secrets, tokens, webhook URLs,
payment details, or sensitive staff data in `title`/`body`/external payloads.
`meta` is client-readable when the row is visible. `action_url` must target
proxy/ACL-protected routes. Branch scope must be explicit for branch-local
work. Inventory residual `/br/{site}/stock/*` URLs resolve to L0 `/inventory/*`
for Owner, Accountant, and central roles at feed hydration
(`resolveNotificationActionUrl`); Branch Manager / floor keep the `/br` plane.
