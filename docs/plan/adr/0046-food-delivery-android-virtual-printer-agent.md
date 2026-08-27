# ADR 0046 — Hardware-independent Android virtual printer intake

**Status:** Accepted

**Decision owner:** Owner, 2026-08-27

**Review tier:** T2 — architecture, integration, webhook security, edge deployment

**Amends:** ADR 0025 delivery intake implementation

## Context

ShopeeFood, GreenSM Food, and beFood applications can emit ESC/POS jobs to a network printer but do not share one public order API. The intake device must not depend on a SUNMI terminal or its built-in print service. An ordinary Android phone can expose a raw TCP printer endpoint on loopback or, by explicit opt-in, the branch LAN.

The previous implementation bound its local endpoint through Android's generic loopback lookup, which resolves to IPv6 on Android, while operator instructions configured delivery apps for IPv4 `127.0.0.1`. It also labeled every captured receipt as ShopeeFood and forwarded bytes to a SUNMI-only AIDL service.

## Decision

1. `tools/matu-agent` is the Android edge application and has no vendor printer SDK dependency.
2. `PrintIntakeService` accepts bounded ESC/POS streams on TCP port `9100`.
3. Local mode binds explicitly to IPv4 `127.0.0.1`. LAN mode binds to `0.0.0.0` only after operator opt-in because the raw printer port has no peer authentication.
4. The Agent detects ShopeeFood, GreenSM Food, or beFood from independent receipt signatures. Zero or multiple matches fail closed: the raw receipt is retained locally as `UNCLASSIFIED` and is not posted.
5. Classified receipts are persisted before dispatch and posted to `/api/webhooks/delivery/relay` with `x-delivery-relay-secret`. The legacy ShopeeFood route remains an alias for the existing browser extension.
6. The server independently detects the source in raw receipts and rejects missing or conflicting identity. A declared platform cannot override receipt evidence.
7. The existing atomic `create_order` RPC, branch scope, external reference deduplication, KDS routing, and platform payment reconciliation remain authoritative.
8. Physical customer/driver printing is outside this Agent's responsibility. A separate printer destination or future explicit fan-out component may provide it.

## Consequences

- The same APK can run on ordinary supported Android hardware.
- Platform attribution is explicit and cannot silently fall back to ShopeeFood.
- Network outages do not discard classified receipts; the SQLite queue retries them with capped backoff.
- Unclassified receipts require operational review instead of creating a potentially incorrect POS order.
- Delivery apps must support a raw TCP/Wi-Fi printer target for this intake path.

## Verification

- Android unit tests cover IPv4/LAN bind selection and platform detection, including unknown and conflicting receipts.
- Web parser tests cover platform labels and fail-closed behavior.
- Android debug build verifies the manifest and service wiring.
- Device acceptance verifies each delivery app against `127.0.0.1:9100` on an ordinary Android phone.
- `corepack pnpm verify` is the repository completion gate.
