# ADR-0007: Branch Hub Architecture

Status: proposed
Date: 2026-05-07 (adopted from matu-superapp 2026-05-06)
Decision owner: Owner + Tech Lead

## Context

A restaurant branch runs multiple devices during service: a main POS terminal, several handheld POS for waiters, one or more KDS displays in the kitchen, and one or more receipt printers. The frontline runtime is Flutter (ADR-0006).

A peer-to-cloud model where every device talks to Supabase directly has structural problems for restaurant operations:

- Multiple writers per branch race on the same orders/payments and need distributed locks via RPC.
- A Supabase Realtime connection per device multiplies the connection budget per branch.
- Internet failure paralyzes all devices simultaneously.
- Receipt printing has no clear owner, so any device might trigger a print and create duplicates.
- Offline tolerance has to be solved per device instead of once per branch.

Restaurant operations also routinely lose Wi-Fi (router crash, ISP outage, electrical glitch). Bluetooth is built into every Android tablet and Windows mini-PC and works peer-to-peer without a router; the architecture must include it as a transport.

## Decision

Adopt a **Branch Hub Architecture**:

- Each branch designates **one active Hub device**. The Hub is the sole writer to Supabase from frontline devices for that branch.
- Other frontline devices (handheld POS, KDS displays, network printers) are **LAN/BT clients of the Hub** during normal operation.
- Frontline–Hub coordination uses a **multi-transport local protocol**: Wi-Fi LAN as the primary transport and Bluetooth as the failover transport.
- The Hub is the **sole driver of receipt printers** for the branch via maintained Flutter native plugins (USB / Bluetooth Classic SPP / BLE / Wi-Fi ESC/POS).
- The Hub keeps **local SQLite as the branch source of truth** during the active operating window and syncs to Supabase via outbox when internet is available.
- Server (Supabase RLS + RPC) remains the **legal source of truth** for money, stock, tax, payroll, and audit records once synced.
- Handheld emergency direct-to-cloud is governed by ADR-0008.

## Multi-Transport Policy

| Transport | Role | Use cases | Notes |
|---|---|---|---|
| Wi-Fi LAN | Primary | All inter-device messages, Supabase sync | Branch AP, mDNS service discovery, WebSocket message channel |
| Bluetooth (BLE + Classic SPP) | Fallback / peripheral | When Wi-Fi/router is unavailable; native printer/scanner peripherals | BLE for device-to-device and discovery; Classic SPP for legacy ESC/POS printers |
| Cloud (Supabase) | Internet sync | Hub → Supabase only | Handheld/KDS never call Supabase RPC during normal operation |

Rules:

- Both Wi-Fi and Bluetooth transports use the **same hub-issued pairing secret** for HMAC-authenticated messages.
- Failover from Wi-Fi to Bluetooth must be automatic within a bounded window and surface a stale/reconnecting indicator.
- Bluetooth payload size is bounded; large messages chunk or refuse rather than fragment silently.
- Internet is never required for branch operation, only for cloud sync.

## Flutter Flavor Strategy

One Flutter codebase under `apps/frontline_flutter/`, three build flavors:

| Flavor | Target device | Owns | Permissions |
|---|---|---|---|
| `hub` | Android tablet or Windows mini-PC, fan-cooled, 24/7 | LAN host, BT advertiser, Supabase writer, printer driver, local SQLite store | Network, BT advertise/connect, USB, foreground service |
| `handheld` | Android phone or small tablet | Order draft entry, LAN/BT client of Hub, optional emergency direct-cloud (ADR-0008) | Network, BT scan/connect (no advertise), no USB |
| `kds` | Android tablet treo bếp | Read-only kitchen queue, bump/recall via LAN/BT, screen wake-lock | Network, BT scan/connect, keep-screen-on |

Same `lib/core/` is shared by all flavors. Flavor-specific code lives in `lib/roles/{hub,handheld,kds}/` and is wired via `lib/main_{hub,handheld,kds}.dart` entry points.

Compile-time separation prevents misconfiguration: a handheld build cannot be set to act as a hub even if a malicious or buggy runtime flag tries.

The flavor pattern generalizes to future Super App surfaces (`customer_app`, `owner_mobile`, `supplier_portal`) without a new codebase.

## Pairing And Trust

- First-run pairing flow: Hub displays a QR code that encodes a derived shared secret + branch context.
- Handheld and KDS scan the QR; both transports (Wi-Fi service discovery + Bluetooth bonding) are established in the same flow.
- The shared secret HMACs every LAN/BT message with a monotonic counter to prevent replay.
- Pairing tokens are revocable from the back-office web (`apps/web/app/admin/...` admin surface).
- Source IP and Bluetooth MAC are not trusted for authorization on their own.

## Failure Modes Covered

| Failure | Behavior |
|---|---|
| Internet down | Hub queues outbox; branch operates on Wi-Fi LAN; sync resumes when internet returns. |
| Wi-Fi router/AP down | Devices fail over to Bluetooth; reduced range and bandwidth, but service continues. |
| Hub down | Handheld emergency mode (ADR-0008) — manual trigger, restricted scope. |
| Printer down | Hub keeps receipt jobs queued; retry when printer back; payment is not rolled back. |
| Both Wi-Fi and Bluetooth down | Service halts; this is acceptable because the branch has lost all local connectivity. |

## Alternatives Considered

| Alternative | Assessment |
|---|---|
| Peer-to-cloud (every device → Supabase) | Rejected: conflict matrix, connection cost per branch, no offline behavior, no clear print owner |
| Cloud-mediated branch (Supabase as broker) | Rejected: makes internet a hard dependency for service |
| Hub with Wi-Fi only | Rejected per owner direction: router is a real-world single point of failure; Bluetooth is built into every device and was a missing piece |
| Bluetooth only | Rejected: range and bandwidth insufficient for full branch operation |
| Two active hubs (active-active) | Rejected: split-brain risk and complex consensus; defer to future ADR if scale demands |
| Two hubs active-passive | Deferred: handheld failover (ADR-0008) covers the same need at lower cost for pilot |

## Consequences

- The repo gains `apps/frontline_flutter/` with three flavors and supporting Dart packages (`packages/matu_api`, `packages/matu_local`, `packages/matu_lan_transport`).
- The Bluetooth dependency adds Android 12+ runtime permission flow (`BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_ADVERTISE`).
- The schema gains `terminal_role`, `branch_hub_assignments`, `branch_lan_pairings`, and `hub_handover_events` tables.
- Pilot QA must include a deliberate Wi-Fi-down test with Bluetooth fallback and a hub-down test with handheld failover.
- Branch onboarding gains a one-time pairing flow; the runbook must document QR pairing + transport verification.
- Existing comtammatu print-agent (`apps/print-agent/`, LAN-only Node process) RETIRES once Hub flavor takes over print ownership — confirmed in W5 transition.

## Acceptance Gates

- ADR-0008 (handheld failover) accepted in parallel.
- `docs/architecture/client-strategy.md` updated with multi-transport, flavor, and failover sections (W0' deliverable).
- Pairing protocol prototype (QR → shared secret → Wi-Fi+BT trust) implemented in `packages/matu_lan_transport`.
- Three Flutter flavors (`hub`, `handheld`, `kds`) build and run a smoke flow: pair → place order → KDS receives → printer prints → cloud sync.
- Wi-Fi-down test passes: branch continues operating via Bluetooth.
- Hub-down test passes: handheld can enter emergency mode manually.
- Schema migrations for `terminal_role`, `branch_hub_assignments`, `branch_lan_pairings`, `hub_handover_events` exist.
- Regression rules `HUB-*`, `HANDHELD-*`, and `TRANSPORT-*` are added to `tasks/regressions.md` and referenced in `docs/agent/rules/security.md` and `docs/agent/rules/database.md`.

## Forward Pointers

- ADR-0006: Flutter client decision and target priority.
- ADR-0008: Handheld failover when the Hub is unavailable.
- ADR-0014: Realtime channel lifecycle, updated to hub-fans-out (renumbered from matu-superapp ADR-0004).
- `docs/architecture/client-strategy.md`: client split, transport details, pairing flow, failover matrix.
- `tasks/regressions.md`: enforced invariants for hub, handheld, KDS, and transport.
