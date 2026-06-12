# Toast And Notification System

> Status: design contract | Updated: 2026-06-10 | Scope: app-wide transient toast, durable in-app notifications, installed-PWA push, and external notification outbox

## UI Scope Declaration

- Surface: all authenticated web surfaces plus operational POS/KDS surfaces.
- Primary user job: know whether the current action succeeded, failed, needs retry, or created follow-up work.
- Route family: `/admin/*`, `/br/[branchId]/pos`, `/br/[branchId]/kds`, `/employee`, `/inventory/*`, `/notifications`.
- Change type: behavior and UX contract. Runtime code should follow this contract before adding new notification producers.
- Primitives: `Sonner`, `Button`, `Popover`, `Card`, `ScrollArea`, `Badge`, `Empty`, `Item`, `Tooltip`, and route shells from the active shadcn preset.

## Decision

The system has three feedback channels with different durability:

- Toast: short-lived client feedback for the action currently happening on screen. Use `toast` from `@comtammatu/ui/components/sonner`.
- In-app notification: durable, role/branch-scoped work item stored in `public.notifications`, read state in `public.notification_reads`, and surfaced through `/notifications`, Cổng nhân viên, or an approved bell/entry point.
- Installed-PWA push: device-level alert for active staff subscriptions stored in `public.notification_push_subscriptions`, delivered through `/api/cron/notifications-push`, and linked back to `/notifications` or the notification action URL.
- External outbox: delivery attempt queue in `public.notification_outbox` for webhook-style channels such as Slack, Discord, Telegram proxy, Zalo bridge, or future workers.

Do not collapse these channels. A toast is not an audit trail. An in-app notification is not a replacement for immediate form feedback. Installed-PWA push is only an attention layer over durable notifications. The external outbox is not the unread feed.

## Authority

Use these sources in order:

1. Runtime UI contract: `docs/spec/design-system.md`
2. Toast primitive: `packages/ui/src/components/sonner.tsx`
3. Durable feed and push actions: `apps/web/app/_actions/notifications.ts`
4. Durable feed UI: `apps/web/app/_components/notification-*`
5. Installed-PWA push runtime: `apps/web/app/sw.ts`, `apps/web/lib/notifications/web-push.ts`, and `/api/cron/notifications-push`
6. Database contract: `supabase/migrations/00000000000000_baseline.sql` (bảng notifications; migration gốc nằm trong `_archive/`) and forward notification migrations
7. External outbox: `public.notification_outbox` and module-specific dispatchers
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
  -> /notifications, Cổng nhân viên, shell entry point, or approved bell

Installed PWA push
  -> public.notification_push_subscriptions row after user permission
  -> cron dispatcher reads durable notifications idempotently
  -> Web Push display from service worker
  -> notification click focuses or opens the action URL

External delivery
  -> notification_outbox row
  -> dispatcher / worker retries bounded delivery
  -> status is sent, failed, skipped, or pending
```

## PM Scope

MVP acceptance:

- Every client-side action has one clear immediate feedback path: inline validation for field issues, toast for action-level outcome, or blocking dialog for destructive confirmation.
- Any workflow event that must survive navigation, involve another role, or require follow-up creates a durable notification.
- The notification feed supports unread count, mark-read, mark-all-read, entity deep links, severity, expiry, and deduplication.
- Toasts and notifications share severity semantics and vocabulary, but do not share storage.
- Android and iOS staff devices can opt in to installed-PWA push where the browser/platform supports Web Push.
- Notification producers can be audited by event kind, entity, target role, target branch, and dedup key.

Out of scope for the current contract:

- Native-app-only APNs/FCM SDK delivery.
- Email/SMS/Zalo native delivery.
- A second visual notification system outside shadcn/Sonner.
- Per-user notification rows. Targeting stays role/branch based; read state is per user.

## BA Rules

### Use Toast For

- The current user completed a direct action: save, submit, print, export, copy, open shift, close shift.
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
| GRN price variance needs approval             | Yes for submitter                         | Yes for approver role                            | Optional                             |
| Stock low recurring alert                     | No unless user triggered check            | Yes with dedup key                               | Optional                             |
| KDS ticket received                           | Usually no toast if visible in live queue | Optional only for cross-station handoff          | No                                   |
| Print job retry failed                        | Error toast for operator                  | Yes for settings/admin if repeated               | Optional                             |

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

## Kind Taxonomy

Use stable namespaced `kind` values:

```text
<domain>.<event>
```

Allowed domain prefixes:

- `pos`
- `kds`
- `inventory`
- `procurement`
- `stocktake`
- `finance`
- `hr`
- `settings`
- `system`
- `workflow`

Examples:

- `pos.payment_failed_repeated`
- `inventory.stock_low`
- `inventory.expiry_soon`
- `procurement.grn_requires_review`
- `stocktake.conflict_created`
- `stocktake.escalation_required`
- `finance.period_close_blocked`
- `hr.contract_expiring`
- `system.integration_failed`

Do not encode branch, role, severity, or status into `kind`; those belong in dedicated fields or `meta`.

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

Recommended patterns:

| Event              | Dedup key                                                 |
| ------------------ | --------------------------------------------------------- |
| Stock low          | `inventory.stock_low:{branch_id}:{ingredient_id}`         |
| Expiry soon        | `inventory.expiry_soon:{branch_id}:{lot_id}:{date}`       |
| GRN price variance | `procurement.grn_price_variance:{grn_id}:{ingredient_id}` |
| Stocktake conflict | `stocktake.conflict:{session_id}:{line_id}`               |
| Integration failed | `system.integration_failed:{integration}:{date}`          |
| SLA breach         | `workflow.sla:{entity_type}:{entity_id}:{sla_name}`       |

If an event can occur multiple times legitimately, include the domain event id. If repeated rows add no value, keep the dedup key stable and update metadata or rely on `ON CONFLICT`.

## Toast Architecture

Toast path:

```text
Client event -> local validation / Server Action -> ActionResult -> toast.*
```

Rules:

- Import from `@comtammatu/ui/components/sonner`.
- Root mounting stays in `apps/web/app/layout.tsx` through `<Toaster />`.
- Use Sonner variants directly: `toast.success`, `toast.error`, `toast.warning`, `toast.info`, `toast.message`, and `toast.loading`.
- Keep title to one sentence.
- Put secondary details in Sonner `description` only when it changes what the user should do next.
- Avoid stacked duplicate toasts from rapid clicks; disable pending buttons or use a stable toast id.
- Do not render custom toast containers or page-local toast systems.
- Do not use URL flash/search params for non-auth action feedback. Route-level redirects with reasons are reserved for permission, auth, and scope failures such as `/access-denied?reason=...`.

Recommended copy pattern:

| Variant            | Meaning                                                       | Example                                   |
| ------------------ | ------------------------------------------------------------- | ----------------------------------------- |
| `success`          | Action completed and no further action is needed              | `Đã lưu cài đặt`                          |
| `info` / `message` | Neutral state or next-step hint                               | `Đang chờ thanh toán`                     |
| `warning`          | Parent action succeeded but follow-up is needed               | `Waste auto đã gửi nhưng admin cần xử lý` |
| `error`            | Action failed and the current user can retry or correct input | `Không thể xác nhận thanh toán`           |
| `loading`          | Action is in progress and should resolve/update               | `Đang xử lý...`                           |

## Toast Copy Rules

Good toast copy:

- Says what happened, not which function ran.
- Uses the business object name when useful.
- Avoids raw exception text.
- Does not blame the user.
- Gives the next action only when needed.

Patterns:

```text
Đã lưu cài đặt
Không thể xác nhận thanh toán
Chọn nguyên liệu cần xuất
Waste auto đã gửi nhưng admin cần xử lý
```

Avoid:

```text
PGRST204
insert failed
RPC returned 22023
Unexpected error
Success!
```

## In-App Notification Architecture

Durable notification path:

```text
Domain event / RPC / server action
  -> insert public.notifications
  -> RLS filters by tenant, role, branch
  -> useNotifications refetches list + unread count
  -> NotificationList renders item rows
```

Current runtime pieces:

- `apps/web/app/_actions/notifications.ts`: list, unread count, mark one read, mark all read.
- `apps/web/app/_hooks/use-notifications.ts`: realtime subscription and refetch.
- `apps/web/app/_components/notification-list.tsx`: feed composition.
- `apps/web/app/_components/notification-item.tsx`: item row and action URL navigation.
- `apps/web/app/notifications/page.tsx`: full feed route.
- Chuông desktop floating: ĐÃ XÓA 2026-06-10 (stub return null từ 24/04, owner quyết xóa). Mobile dùng chuông trong mobile-header; nếu mở lại desktop bell cần shell placement được duyệt + khôi phục component từ git history (`7649253e`).

UI rules:

- Use list/item primitives, not hand-styled fake cards.
- Notification row click may mark read, then navigate to `action_url`.
- If `action_url` is absent, row still marks read but should not imply a next action.
- Severity icon/color must come from semantic tokens and existing Lucide icons.
- Full feed page should be the reliable source; bell/popover is a shortcut.

## Surface Placement

### POS

- Toasts are allowed for payment, order creation, print, session open/close, and recoverable cashier errors.
- Do not show global notification chrome that competes with cart/payment work.
- Durable notifications are for manager/admin follow-up, not cashier confirmation.

### KDS

- Live queue is the primary notification surface for kitchen work.
- Use toast only for mutation feedback such as bump/undo/cancel failure.
- Avoid creating notification rows for every ticket movement unless another station/role needs handoff.

### Admin

- Full notification feed and badge/entry point are appropriate.
- Admin notifications should link to review queues, settings, audit, finance, staff, or inventory exception pages.

### Inventory

- Durable notifications are expected for stock low, expiry, GRN variance, stocktake conflicts, period-close issues, supplier returns, and approval queues.
- Toasts confirm the local action only; durable rows carry cross-role obligations.

### Employee

- Keep notifications task-led and narrow.
- Do not turn employee notification feed into an admin dashboard.

## Producer Patterns

### Client Action Pattern

```tsx
const result = await saveSomething(input);
if (!result.success) {
  toast.error(result.error ?? "Không thể lưu dữ liệu");
  return;
}
toast.success("Đã lưu dữ liệu");
```

### Server Action Pattern

```ts
if (error) {
  console.error("saveSomething", error);
  return { success: false, error: "Không thể lưu dữ liệu" };
}
return { success: true };
```

### RPC-Critical Notification Pattern

```sql
-- Inside the same transaction as the domain state change.
INSERT INTO public.notifications (
  tenant_id,
  target_branch_id,
  target_roles,
  kind,
  severity,
  title,
  body,
  entity_type,
  entity_id,
  action_url,
  dedup_key,
  meta
) VALUES (...);
```

Use RPC when notification creation is part of an atomic workflow. Examples: finalizing stocktake creates conflicts, confirming GRN creates approval requirement, hard block creates escalation.

## External Outbox

`notification_outbox` is for delivery attempts, not unread state.

A workflow may write both:

- `notifications`: what authorized users see in the app.
- `notification_outbox`: what an external webhook/worker should deliver.

Rules:

- Dispatchers must be idempotent.
- Retries must be bounded.
- No webhook configured should become `skipped`, not infinite `pending`.
- Failed external delivery must not roll back the parent business transaction unless the business explicitly requires external acknowledgement.
- Payloads should include stable identifiers and links, not raw database errors or secrets.

## Error Handling

Server-side:

- Log technical error details server-side.
- Return safe Vietnamese messages in `ActionResult.error`.
- Never return raw Supabase/Postgres `error.message` to clients.

Client-side:

- Use inline field errors for specific form fields.
- Use toast errors for action-level failures.
- Use durable notifications only for actual workflow obligations.

Database:

- RPC errors intended for UI should be mapped by the server action.
- Constraint names and SQLSTATE codes should not appear in toast or notification title/body.

## Anti-Spam And Rate Limits

The feed must optimize for actionable work, not event volume.

Rules:

- Repeated system checks need `dedup_key`.
- Scheduled alerts should rate limit by entity and period.
- High-frequency operational events should update a live view, not create notifications.
- Toasts from repeated clicks should be prevented by pending state or stable id.
- Critical events may bypass normal quieting only when they require immediate action.

Default dedup windows:

- Stock low: one active notification per branch + ingredient until replenished.
- Expiry soon: one per lot per date window.
- Price drift: one per supplier + ingredient per week unless threshold tier changes.
- Integration failure: one per integration per day, with retry count in `meta`.
- SLA breach: one per entity + SLA.

## Accessibility

Toast:

- Sonner handles live announcements; keep copy concise.
- Do not require users to click a toast to finish a workflow.
- Toast duration should not be the only place critical information exists.

Notification feed:

- Bell/entry buttons need accessible labels and visible unread count.
- Rows must be keyboard reachable.
- Unread state must not rely only on color; use font weight, dot, label, or count.
- `action_url` navigation must be predictable and authorized.

## Security And Privacy

- RLS is the primary visibility boundary for durable notifications.
- Do not put secrets, tokens, raw webhook URLs, customer payment details, or sensitive staff data in `title`, `body`, or external payloads.
- `meta` is still client-readable when the row is visible; treat it as user-facing data.
- `action_url` must point to routes protected by proxy/ACL.
- Branch scope must be explicit for branch-local work.

## Observability

Each notification producer should be traceable:

- Log producer failures with producer name and entity id.
- Use `kind` and `dedup_key` for queryable diagnostics.
- Include `correlationId` in `meta` when the source workflow already has one.
- Track external delivery status in outbox rows.

Useful operational questions:

- Which notification kinds are most frequent?
- Which critical notifications stay unread longest?
- Which dedup keys are repeatedly updated?
- Which external channels are failing or skipped?

## QA/QC Verification

Before marking runtime implementation complete:

- `pnpm typecheck && pnpm lint && pnpm build` passes.
- Toasts are not used for durable workflow obligations.
- Durable notifications have RLS-covered visibility and do not leak cross-tenant or cross-branch data.
- Unread count updates after insert, mark-read, mark-all-read, visibility change, and page reload.
- `action_url` is authorized by proxy/ACL and lands on the next safe action.
- Repeated events respect `dedup_key` or rate limits.
- User-facing copy is Vietnamese, safe, and does not expose raw database messages.
- Mobile POS/KDS first viewport remains focused on the main operational task.

Documentation-only verification:

- Changed docs match `apps/web/components.json`, `packages/ui/components.json`, `packages/ui/src/components/sonner.tsx`, and existing notification actions.
- No new runtime behavior is implied without an implementation path.

## Test Matrix

| Area                    | Test                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| Toast success           | Trigger a known successful action and verify one success toast appears |
| Toast error             | Force a safe action failure and verify sanitized Vietnamese copy       |
| Toast duplicate         | Double-click pending action and verify no toast storm                  |
| Notification visibility | Same tenant role sees row; unrelated role/branch does not              |
| Notification unread     | New row increments unread count                                        |
| Mark read               | Clicking item marks it read and optionally navigates                   |
| Mark all                | Visible unread rows become read for current user only                  |
| Expiry                  | Expired row no longer counts as unread active work                     |
| Dedup                   | Repeated event does not create duplicate active rows                   |
| Outbox skipped          | No webhook configured marks rows skipped                               |
| Outbox failed           | Non-2xx delivery increments retries and stores safe error metadata     |

## Rollout Plan

1. Keep the existing Sonner root setup as the only toast provider.
2. Standardize new client actions on `ActionResult -> toast` handling.
3. Add durable notification producers only at workflow boundaries.
4. Use RPC-based producers for atomic multi-item workflows.
5. Re-enable or redesign notification bell placement only per route shell, starting with admin/inventory, not POS/KDS.
6. Add regression tests around visibility, unread count, and producer dedup for each new notification family.

## Implementation Checklist

For any new toast:

- Is the action local to the current user?
- Is the message short and safe?
- Is there a pending state to prevent duplicate toasts?
- Is field-specific feedback inline instead?

For any new durable notification:

- What role owns the next action?
- Is the branch target explicit?
- What business entity does it link to?
- What `kind` and `dedup_key` make it queryable?
- Should it expire?
- Does RLS protect it?
- Does completing the business task happen outside read state?

For any new external delivery:

- Is the parent transaction allowed to succeed if delivery fails?
- What is the retry limit?
- What data is safe to send out?
- How is skipped/failed status surfaced to admins?
