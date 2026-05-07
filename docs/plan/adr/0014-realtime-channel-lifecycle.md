# ADR-0014: Realtime Channel Lifecycle

Status: proposed
Date: 2026-05-07 (renumbered from matu-superapp ADR-0004 dated 2026-05-06)
Decision owner: Tech Lead + Frontline Owner

> **Note on numbering:** This ADR was matu-superapp's ADR-0004. comtammatu's ADR-0004 is `position-code-normalization`. Per ADR reconciliation 2026-05-07 (option A2 diff+merge), this ADR was renumbered to 0014 to avoid collision. Content unchanged except cross-references.

## Context

POS and KDS depend on realtime updates during long branch shifts. JWT refresh, reconnects, channel cleanup, branch changes, and tab switching can silently break subscriptions unless lifecycle handling is standardized.

comtammatu has existing realtime work in POS/KDS (`apps/web/app/br/[branchId]/kds/_hooks/use-realtime-channel.ts`) with rules already lockd: `REALTIME-AWAIT-AUTH-BEFORE-SUBSCRIBE`, `REALTIME-CHANNEL-RESUBSCRIBE-ON-TOKEN-REFRESH`, `POS-RESUME-MUST-REFETCH`. This ADR formalizes the contract and extends it for Flutter (per ADR-0006 + UC1).

## Decision Needed

Define the one approved subscription helper and lifecycle:

- When subscription may start.
- How tenant/branch scope enters channel names.
- How token refresh triggers resubscribe.
- How removed channels are tracked.
- How UI detects stale realtime.

## Recommendation

Build one shared realtime helper per client runtime, with the **Branch Hub fan-out** model from ADR-0007 as the default for frontline:

- The Branch Hub flavor is the **only frontline subscriber** to Supabase Realtime per branch.
- Handheld and KDS flavors receive realtime updates from the Hub via the LAN/BT transport, not directly from Supabase.
- This caps the per-branch Realtime connection budget at one (plus the back-office web admin sessions, which subscribe directly).
- Back-office web (`apps/web`) admin uses `@supabase/ssr` directly with the same lifecycle rules.

Lifecycle rules apply to every direct subscriber (Hub flavor, back-office web):

- Wait for authenticated session before subscribing.
- Include tenant and branch/site scope in channel identity.
- Resubscribe after token refresh.
- Synchronously evict removed channels from local registries.
- Surface stale/reconnecting state to operators when the queue is not trustworthy.

Flutter-specific lifecycle additions (Hub flavor):

- Resubscribe on Flutter `AppLifecycleState` resume after pause/inactive.
- Resubscribe on connectivity transitions (Wi-Fi → BT fallback → Wi-Fi recovery).
- LAN/BT fan-out queue must replay missed events to a re-pairing handheld/KDS within a bounded window.

## Acceptance Gates

- Unit tests cover helper state transitions for both web (`@supabase/ssr`) and Flutter (`supabase_flutter`) clients.
- E2E test keeps a Hub session alive beyond JWT TTL and verifies new events arrive.
- Branch switch closes old scoped channels before opening new ones.
- KDS queue remains deterministic after reconnect (Hub fan-out replay tested).
- Wi-Fi → BT fallback test: hub-driven KDS continues receiving updates after transport switch.
- No route or app implements a one-off realtime lifecycle.

## Consequences

- Frontline routes depend on shared Hub infrastructure before domain UI expands.
- Per-branch Realtime connection cost is bounded at one regardless of handheld/KDS count.
- W3 cannot be marked complete with only short-session happy-path realtime tests.
- The Hub takes on a fan-out responsibility that must replay missed events for re-pairing clients.
- comtammatu's existing `_hooks/use-realtime-channel.ts` evolves to match this contract; the rules previously named `REALTIME-AWAIT-AUTH-BEFORE-SUBSCRIBE`, `REALTIME-CHANNEL-RESUBSCRIBE-ON-TOKEN-REFRESH` stay enforced, with new rules added for Flutter side.

## Cross-References

- ADR-0006: Frontline Flutter Client.
- ADR-0007: Branch Hub Architecture (drives fan-out model).
- ADR-0010: Flutter Implementation Choices §"Realtime Helper Contract".
- `tasks/regressions.md`: `REALTIME-AWAIT-AUTH-BEFORE-SUBSCRIBE`, `REALTIME-CHANNEL-RESUBSCRIBE-ON-TOKEN-REFRESH`, `REALTIME-EVICT-CHANNEL-SYNC-AFTER-REMOVE`, `REALTIME-CHANNEL-NAME-SCOPED`, `REALTIME-LONG-SESSION-TEST`, `REALTIME-NO-CLIENT-TRUSTED-FILTER`, `REALTIME-PUBLICATION-ALLOWLIST`, `REALTIME-HUB-FANS-OUT`.
