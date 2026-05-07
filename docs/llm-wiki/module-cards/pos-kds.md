# Module Card — POS & KDS

## Current State

POS and KDS are shipped frontline workspaces.

- POS route: `/br/[branchId]/pos`
- KDS route: `/br/[branchId]/kds`
- Both are branch-scoped through URL path and proxy checks.
- POS PWA support is shipped with per-branch manifest and Serwist service worker.
- Realtime hardening is shipped through the shared subscription helper.
- Print-agent integration exists for LAN/USB printer workflows.

## POS Ownership

POS owns:

- opening and closing POS sessions
- service context selection
- table/takeaway order creation
- cart and order submit
- bill and payment confirmation
- append items after submit
- split/merge/transfer/void/cancel flows where implemented
- receipt printing and print job enqueue

Payment collection remains POS-owned. Do not move payment collection into `/employee`, `/admin`, or `/merchant/*`.

## KDS Ownership

KDS owns:

- kitchen queue by branch/station
- ticket state changes
- bump/recall actions
- station/category mapping
- fulfillment state visibility

KDS state is fulfillment only. POS payment closes the commercial order; KDS fulfillment must not gate payment or table release.

## Branch Rules

- POS allowed roles: cashier, waiter, branch_manager.
- KDS allowed roles: chef, branch_manager.
- POS/KDS are blocked on `central_warehouse` and `central_kitchen`.
- In production, POS/KDS also pass the branch network gate unless `POS_NETWORK_GATE=off`.

## High-Risk Regression Rules

- `served` is not table terminal; only `completed`/`cancelled` release table.
- Payment auto-completes the POS order commercially and must not force KDS ticket completion.
- POS served action requires active items to be ready/served/cancelled.
- Payment amount must be recomputed server-side before confirmation.
- Payment webhooks must be idempotent and tenant-bound.

## What To Do Next

For POS/KDS rebuild work:

1. Keep operational flow direct; do not route through admin.
2. Keep cart scoped to new order creation.
3. Put existing-order mutation in order detail/history.
4. Keep KDS queue-first.
5. Verify branch scope, network gate, realtime subscription, and print job paths.
