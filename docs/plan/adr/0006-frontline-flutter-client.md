# ADR-0006: Frontline Flutter Client

Status: proposed
Date: 2026-05-07 (adopted from matu-superapp 2026-05-06)
Decision owner: Owner + Tech Lead

## Context

Restaurant frontline workflows need reliable packaging, local persistence, printer/device integration, and predictable runtime behavior during service. A native cross-platform client meets those needs directly; a browser-based runtime does not.

This ADR overrides the previous PWA-only direction stated in `05-MODULE-CATALOG.md:891` ("Native mobile app (Flutter) | Dropped 2026-05-06"). The drop was conflated with abandoning a fork strategy; UC1 (2026-05-07) re-debates Flutter as a separate architectural decision and accepts it.

## Decision

Use Flutter as the primary frontline client stack, structured as **one codebase with three build flavors**:

- `hub` — Branch Hub on Android tablet or Windows mini-PC. Sole writer to Supabase per branch, sole printer driver, sole KDS broker, local SQLite authoritative store. See ADR-0007.
- `handheld` — waiter/cashier handheld POS (Android phone or small tablet). LAN/BT client of the Hub during normal operation; emergency direct-cloud mode per ADR-0008.
- `kds` — kitchen display tablet. Read-only LAN/BT client of the Hub.

Client split:

- Flutter app (all three flavors) owns POS, KDS, employee self-service, branch ops, stocktake, and device/print integration.
- Next.js back-office web (`apps/web/`) owns admin, finance, HR management, reporting, settings, and documentation/admin-heavy workflows.
- Supabase/Postgres/RLS/RPC remains the source of truth.
- Payment, stock ledger, refund, HĐĐT, and period-close writes stay online/RPC-backed by default. The Hub flavor performs them; handheld may perform a restricted subset only in emergency mode (ADR-0008).
- Inter-device coordination inside a branch uses Wi-Fi LAN primary and Bluetooth fallback (ADR-0007).

The flavor pattern is intentionally chosen so future Super App surfaces (`customer_app`, `owner_mobile`, `supplier_portal`) can be added as additional flavors without a new codebase.

## Migration From Existing State

comtammatu currently runs POS/KDS as Next.js routes under `apps/web/app/br/[branchId]/{pos,kds}`. These routes are PRESERVED during the rebuild and serve as fallback / training surface. New Flutter frontline ships in parallel:

- W5 (per `06-WAVE-PLAN.md`): Flutter `hub` flavor handles branch service authoritative writes; Next.js POS routes go read-only or admin-managed-only.
- Post-cutover: Next.js POS routes deprecate after pilot validates Flutter parity.

Velocity baseline (W0' Phase 2) measures Flutter dev hours including 1 native plugin call (USB ESC/POS or BLE) before W5 commits to Flutter rollout.

## Alternatives Considered

| Alternative | Assessment |
|---|---|
| PWA-only (status quo before this ADR) | Rejected for primary frontline runtime: device integration, local persistence, and branch packaging are too risky for service operations |
| React Native/Expo | Strong alternative, especially for TypeScript reuse, but desktop/printer story is less direct for our branch terminal needs |
| Kotlin Multiplatform/Compose | Strong Android-first option, but team velocity and cross-platform UI maturity are less favorable for this project baseline |
| Tauri | Good desktop shell, not the best first choice for Android tablet-first POS/KDS |
| Native Android first | Strong hardware integration, but slows iOS/desktop and shared UI delivery |

## Consequences

- The repo is a polyglot monorepo: TypeScript for web/backend tooling and Dart/Flutter for frontline clients.
- Design system has dual implementation: shadcn/Tailwind for web and Flutter token/component package for frontline. Tokens flow from a single source of truth into both implementations.
- Testing includes `flutter analyze`, `flutter test`, Flutter integration tests, and device/printer/transport smoke tests.
- Offline behavior is explicitly designed. Per-flavor offline policy lives in `docs/architecture/client-strategy.md` (W0' deliverable) and is governed by ADR-0007.
- Three flavors produce three Android app IDs (`com.comtammatu.frontline.hub`, `.handheld`, `.kds`) and three release channels per platform.

## Acceptance Gates

- `docs/architecture/client-strategy.md` accepted (W0' Phase 1).
- ADR-0007 (Branch Hub) and ADR-0008 (Handheld Failover) accepted.
- Flutter stable version pinned during runtime bootstrap.
- Dart pub workspace or equivalent Flutter workspace strategy chosen.
- All three flavors (`hub`, `handheld`, `kds`) build cleanly with separate AndroidManifest entries and entry points (`lib/main_hub.dart`, `lib/main_handheld.dart`, `lib/main_kds.dart`).
- Hub flavor can log in, pair, receive an order from a paired handheld, broadcast to a paired KDS, and print a receipt — once over Wi-Fi LAN and once after a forced Bluetooth failover.
- Android tablet hub + handheld + KDS smoke test exists before branch pilot.
- Printer/device integration owned by the Hub via native plugins.
- Velocity baseline (W0' Phase 2) measured: 1 Flutter hello-world + 1 native plugin call dev hours, used to multiply 16wk wave plan estimate.

## Cross-References

- ADR-0007: Branch Hub Architecture
- ADR-0008: Handheld Failover Mode
- ADR-0010: Flutter Implementation Choices
- ADR-0014: Realtime Channel Lifecycle (renumbered from matu-superapp 0004)
- `docs/architecture/client-strategy.md` (W0' deliverable)
