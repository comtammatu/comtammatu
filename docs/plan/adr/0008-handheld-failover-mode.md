# ADR-0008: Handheld Failover Mode

Status: proposed
Date: 2026-05-07 (adopted from matu-superapp 2026-05-06)
Decision owner: Owner + Tech Lead

## Context

ADR-0007 designates one active Branch Hub per branch as the sole writer to Supabase from frontline devices. This concentrates the failure domain: if the Hub crashes or its hardware dies mid-service, the branch loses POS, KDS coordination, and printing simultaneously.

The owner directive is that branch service must not stop because the Hub is unavailable. A failover path must exist from day one of the pilot.

Two general approaches exist:

- Add a redundant Hub (active-active or active-passive) so a second device is ready to take over.
- Allow handhelds to bypass the Hub temporarily and write directly to Supabase under restricted rules.

Active-active introduces split-brain risk. Active-passive doubles hub hardware cost and adds a fail-over election protocol. Direct-to-cloud handheld is simpler at the cost of disabling some workflows during the failover window.

## Decision

Each handheld build of the Flutter frontline app supports an **explicit Emergency Direct-Cloud Mode**.

Rules:

- **Manual trigger only.** A manager or designated cashier engages emergency mode via a confirmed UI action. There is no auto-failover. A momentary network blip must not flip handhelds into emergency mode.
- **Restricted scope.** In emergency mode the handheld may:
  - create order drafts and append items;
  - send orders to a fallback KDS path (server-side broadcast or a second handheld in KDS-display flavor);
  - call cash payment confirm RPC for orders that explicitly opt in to emergency commit;
  - cannot issue HĐĐT;
  - cannot drive receipt printers;
  - cannot approve refunds;
  - cannot post payroll, period close, or any GL-affecting back-office write.
- **Visible UI banner.** While emergency mode is active, every screen shows a persistent banner stating that the Hub is offline and listing the disabled workflows.
- **Audit-tagged writes.** Every Supabase write performed in emergency mode carries `created_via='handheld_failover'` and `emergency_session_id` so reconciliation can find them.
- **Bounded fan-out.** At most a small fixed number of handhelds (default: 1, configurable) may be in emergency mode at the same time per branch, to limit split-brain. Additional emergency activations require manager override.
- **Reconciliation at recovery.** When the Hub returns to service, it pulls all `handheld_failover`-tagged writes since the last hub heartbeat, surfaces them in a manager review queue, and merges them into local SQLite after acknowledgment. Conflicts (e.g. duplicate table assignment) are flagged, never silently merged.
- **Receipts.** Emergency mode does not print receipts. Receipts pending during the emergency window are queued and printed once the Hub recovers, or printed later from back-office web (`apps/web`).

## What Emergency Mode Does Not Do

- It is not a substitute for a redundant Hub during normal operation.
- It does not run KDS broadcast on its own. If the kitchen has only Hub-driven KDS, kitchen will see emergency-mode orders only after Hub recovery or via a manual second-handheld-as-KDS configuration.
- It does not bypass RLS or any RPC authorization. Server-side RPCs accept emergency-tagged writes only from authenticated handhelds with `emergency:engage` permission.

## Alternatives Considered

| Alternative | Assessment |
|---|---|
| Active-active hubs | Rejected for pilot: split-brain risk, more expensive, harder to reason about. May revisit at multi-branch scale |
| Active-passive hubs | Deferred. Adds hardware cost and election protocol; not justified at 1–5 branch scale |
| Auto-failover on network loss | Rejected. Network blips cause false positives. Manual trigger is safer at this scale |
| Skip failover for pilot | Rejected per owner directive: branch service must not stop because Hub dies |

## Consequences

- Server-side `emergency:engage` permission must exist, with a tightly scoped role grant template (manager/cashier).
- Server-side RPCs gain a code path that accepts emergency-tagged writes from handhelds with the permission and rejects the same writes when the originating Hub is alive (last-heartbeat-recent check).
- Schema gains `emergency_sessions` (start_at, end_at, opened_by, branch_id, reason) and `created_via` columns on `orders`, `payments`, `kds_ticket_events`.
- UI gains a confirmation dialog for engaging/disengaging emergency mode and a persistent banner.
- Documentation gains a manager runbook: when to engage, how to recover, how to read the reconciliation queue.

## Acceptance Gates

- `emergency:engage` permission seeded with a tight role grant.
- RPC code path accepts emergency writes only when permission is present and the active Hub heartbeat is older than a threshold.
- Emergency-mode banner cannot be dismissed without disengaging emergency mode.
- Reconciliation queue UI exists in back-office web (`apps/web/app/admin/...`).
- Pilot rehearsal: Hub powered off mid-shift, handheld engages emergency mode, places one cash order, Hub powered on, manager reviews and accepts the emergency order.
- Regression rules `HANDHELD-FAILOVER-MANUAL-ONLY`, `HANDHELD-FAILOVER-RESTRICTED-SCOPE`, and `HANDHELD-FAILOVER-AUDIT-TAGGED` added.

## Forward Pointers

- ADR-0007: Branch Hub Architecture, of which this ADR is the failover companion.
- `tasks/regressions.md`: HANDHELD-* rules.
- `docs/architecture/client-strategy.md`: failover state machine and reconciliation flow (W0' deliverable).
