# ADR-0010: Flutter Implementation Choices

Status: proposed
Date: 2026-05-07 (adopted from matu-superapp 2026-05-06)
Decision owner: Tech Lead

## Context

ADR-0006 chose Flutter as the frontline runtime. ADR-0007 added the Branch Hub model with multi-transport (Wi-Fi LAN + Bluetooth) and three flavors (`hub`, `handheld`, `kds`). ADR-0008 added emergency direct-cloud mode.

These higher-level decisions imply concrete library choices. Without locking them, every contributor (human or AI agent) will pick differently and the codebase fragments before W1 lands.

## Decision

The Flutter codebase under `apps/frontline_flutter/` uses the following pinned set:

| Concern | Choice | Pin policy |
|---|---|---|
| State management | **Riverpod (`flutter_riverpod`)** | Pin major; let Renovate propose minor/patch |
| Local database | **Drift** (SQL-first, code-generated, type-safe) | Pin major; codegen artifacts checked into repo |
| Routing | **`go_router`** | Pin major |
| Lints | **`very_good_analysis`** plus project-specific overrides | Pin exact version in `pubspec.yaml` |
| Supabase client | **`supabase_flutter`** | Pin major; wrap in `packages/matu_api/` |
| Bluetooth Low Energy | **`flutter_blue_plus`** | Pin major; wrap in `packages/matu_lan_transport/` |
| Bluetooth Classic SPP | **`flutter_bluetooth_serial`** | Pin major; only loaded by hub flavor |
| mDNS / service discovery | **`multicast_dns`** | Pin major |
| WebSocket transport | **`web_socket_channel`** | Pin major |
| Permission requests | **`permission_handler`** | Pin major |
| Secure storage (tokens) | **`flutter_secure_storage`** | Pin major |
| QR display | **`qr_flutter`** | Pin major; hub flavor only |
| QR scan | **`mobile_scanner`** | Pin major; handheld + kds flavors |
| Local notifications | **`flutter_local_notifications`** | Pin major; hub flavor (operator alerts) |
| Connectivity detection | **`connectivity_plus`** | Pin major |
| Date/time | **`timezone`** package + DB-derived local dates | Always use `Asia/Ho_Chi_Minh` |
| HTTP for non-Supabase | **`dio`** with interceptor for redaction | Pin major |
| ESC/POS receipt printing | **`esc_pos_printer`** + **`esc_pos_utils`** for byte assembly | Hub flavor only |
| USB device access | **`usb_serial`** (Android) / platform-channel on Windows | Hub flavor only |

Workspace tooling:

- **Dart pub workspaces** for `apps/frontline_flutter/packages/*` resolution.
- **Melos** is **not** required at W1; revisit if multi-package versioning becomes painful.

## Why These Choices

### Riverpod (state management)

- Compile-time safe (no runtime injection mistakes).
- Recommended by the Flutter team for new apps.
- Plays well with `flutter_test` (override providers per test).
- Avoids `Provider`'s context-coupling problems and `Bloc`'s boilerplate at this scale.
- `GetX` rejected: encourages global state and shortcuts that hide testability problems.

### Drift (local DB)

- SQL-first with generated Dart APIs — closest mental model to Postgres on the server.
- Type-safe queries, schema migrations checked into source.
- Performant on Android tablets (typed columns, prepared statements).
- Better than `sqflite` for non-trivial schemas (no hand-typed result mapping).
- Better than `Isar` / `Hive` for our use case because the Hub mirrors a relational schema; document/object DBs would force a translation layer.
- Floor rejected: smaller community, slower codegen iteration.

### `go_router`

- Maintained by the Flutter team; aligned with Navigator 2.0 conventions.
- Declarative routes match the surface model in `docs/architecture/client-strategy.md` (W0' deliverable).
- Alternatives like `auto_route` add codegen weight without proportional benefit at our route count.

### `very_good_analysis`

- Stricter than `flutter_lints` defaults; catches more regressions early.
- Used by Very Good Ventures and others at production scale.
- We add a small project override file to disable rules that conflict with our Vietnamese copy or generated code.

### Bluetooth: `flutter_blue_plus` + `flutter_bluetooth_serial`

- `flutter_blue_plus` is the most actively maintained BLE package across Android/iOS/Linux/macOS/Windows.
- `flutter_bluetooth_serial` handles Bluetooth Classic SPP, which most legacy ESC/POS receipt printers still require. Only the hub flavor links it.
- BLE alone is insufficient for printer interop; combining both covers the device fleet a Vietnamese F&B branch realistically encounters.

### `mobile_scanner` over alternatives

- Maintained, fast, supports inline scanning UX needed for QR pairing flow.
- Older `qr_code_scanner` is unmaintained and crashes on recent Android.

### `flutter_secure_storage`

- Backed by Keychain on iOS/macOS, Keystore on Android, DPAPI on Windows.
- Required for storing pairing secrets, refresh tokens, and emergency-mode confirmation flags. `SharedPreferences` is plain text and unacceptable for any secret.

## Per-Flavor Permission Set

Encoded in `android/app/src/{flavor}/AndroidManifest.xml`:

| Flavor | Network | Bluetooth scan | Bluetooth connect | Bluetooth advertise | USB | Foreground service | Keep screen on |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `hub` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `handheld` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `kds` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ |

Permissions checked at runtime via `permission_handler` with Vietnamese-localized rationale strings.

## Package Layout Reminders

```
apps/frontline_flutter/
  lib/
    main_hub.dart
    main_handheld.dart
    main_kds.dart
    core/
      access_context.dart
      design/   (mirrors web tokens via packages/matu_flutter_tokens)
      models/
      providers/   (Riverpod providers shared by all flavors)
    roles/
      hub/
      handheld/
      kds/
  packages/
    matu_api/           Supabase wrappers (supabase_flutter)
    matu_local/         Drift SQLite + outbox
    matu_lan_transport/ Wi-Fi/BT pairing + HMAC envelope
    matu_flutter_tokens/ design tokens mirrored from web
```

Cross-package import rules:

- `lib/core/` may import any `packages/matu_*`.
- `lib/roles/<flavor>/` may import any `packages/matu_*` and `lib/core/`, but **not** another flavor's role folder.
- `packages/matu_local/` may not import `matu_api` (Drift schema is self-contained).
- `packages/matu_lan_transport/` may not import `matu_api` (transport is below the API layer).

## Alternatives Considered

| Concern | Considered alternative | Reason rejected |
|---|---|---|
| State | `Bloc` | More boilerplate at our scale; team velocity matters more than pattern purity |
| State | `GetX` | Encourages global state; testability and refactor cost worse |
| Local DB | `Isar` | Object DB forces translation between Hub mirror and relational Postgres mental model |
| Local DB | `Hive` | Same as Isar plus weaker query support |
| Local DB | `sqflite` (raw) | Type-safety and migrations need Drift on top anyway |
| Routing | `auto_route` | More codegen weight than `go_router` provides at our route count |
| BLE | `flutter_reactive_ble` | Less active than `flutter_blue_plus` in 2026 release window |
| Lint | `flutter_lints` only | Too permissive; misses the strictness we want from day one |
| HTTP | `http` package | OK for trivial calls but lacks interceptor model we need for redaction |

## Pin Policy

- `pubspec.yaml` uses caret ranges (`^x.y.z`) for runtime dependencies, locked deterministically by committed `pubspec.lock`. Major version bumps require ADR amendment.
- Renovate (or equivalent) proposes minor/patch updates against `pubspec.yaml`; the lockfile change is reviewed.
- A stricter `~x.y.z` (lock through next minor) is allowed for libraries with known unstable minor releases; current set uses caret because Riverpod, Drift, supabase_flutter, flutter_blue_plus follow semver.
- Flutter SDK itself pins via `.fvmrc` or `.flutter-version` once W1 picks the exact stable channel build.

## Realtime Helper Contract (Dart)

The Hub flavor's realtime subscription must serialize three concurrent triggers — auth state changes, connectivity transitions, and `AppLifecycleState` resume — through a single helper. Without it, three listeners can each call resubscribe in parallel and leave the channel registry inconsistent.

```dart
// apps/frontline_flutter/packages/matu_api/lib/src/realtime/use_realtime_channel.dart
class RealtimeChannelHandle {
  Future<void> subscribe();           // idempotent; serialized via mutex
  Future<void> unsubscribe();         // synchronous eviction from local registry
  Stream<RealtimeStatus> statusStream(); // exposes 'subscribed' | 'reconnecting' | 'stale'
}

abstract class RealtimeChannelLifecycle {
  // Single entry point used by hub's AppLifecycle, AuthState, and Connectivity listeners.
  // Internal Mutex ensures only one resubscribe runs at a time.
  Future<void> requestResubscribe({required ResubscribeReason reason});
}

enum ResubscribeReason { tokenRefreshed, signedIn, appResumed, transportRecovered }
```

Implementation rules:

- Wait for `Supabase.instance.client.auth.currentSession != null` before first subscribe.
- Pin `realtime.setAuth(token)` BEFORE every `.subscribe()` call.
- On `AuthState.signedOut`, unsubscribe and clear local channel registry.
- On `AppLifecycleState.resumed` after a backgrounded period > 30s, request resubscribe.
- On `connectivity_plus` transition (Wi-Fi → BT or BT → Wi-Fi), request resubscribe with `transportRecovered`.
- Use a Dart `Mutex` (e.g., `synchronized` package) so concurrent triggers serialize.
- Surface `RealtimeStatus.stale` to UI when more than 5 s elapses without an event after a known data change; UI shows "Đang kết nối lại..." indicator.

## Consequences

- AndroidManifest split is mandatory; no flavor may "borrow" another flavor's permission.
- Platform-channel code for Windows USB belongs in `apps/frontline_flutter/windows/runner/` and is hub-only.
- CI matrix runs `flutter analyze` and `flutter test` per flavor; a future job adds `flutter integration_test` against an Android emulator for the smoke flow.
- The realtime helper is the only place Flutter code touches `Supabase.instance.client.channel(...)`. Bypass attempts fail code review per `REALTIME-AWAIT-AUTH-BEFORE-SUBSCRIBE`.

## Acceptance Gates

- `pubspec.yaml` exists with the pinned set during W1 bootstrap.
- `analysis_options.yaml` includes `very_good_analysis` and project overrides.
- All three flavors compile clean on a fresh checkout with the locked Flutter SDK.
- `packages/matu_lan_transport` exposes a single `LanTransport` interface implemented by both Wi-Fi and Bluetooth transports.
- `packages/matu_local` Drift schema covers menu/config cache, order draft, hub outbox, and emergency-pending table.
- Smoke test: pair → place order → KDS receives → printer prints — over Wi-Fi LAN. Repeat with Wi-Fi disabled and Bluetooth on.
- Velocity baseline (W0' Phase 2): 1 Flutter hello-world + 1 native plugin call dev hours measured before W5 commits.

## Forward Pointers

- ADR-0006: Flutter pivot.
- ADR-0007: Branch Hub Architecture (drives most of the package list).
- ADR-0008: Handheld failover (uses `flutter_secure_storage` for the emergency engagement flag).
- ADR-0014: Realtime channel lifecycle (renumbered from matu-superapp ADR-0004).
- `docs/architecture/design-tokens-bridge.md`: how `packages/matu_flutter_tokens/` stays in sync with web Tailwind (W0' deliverable).
