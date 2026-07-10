# Operational Audio Alerts

> Status: design contract | Updated: 2026-07-10 | Scope: device-local beep + voice alerts on open POS/KDS surfaces\
> Decision: `docs/plan/adr/0008-operational-audio-alerts.md` (voice engine amended to browser TTS, D074)

## UI Scope Declaration

- Surface: `/br/[branchId]/kds` (MVP), later selected `/br/[branchId]/pos` critical events.
- Primary user job: notice a kitchen/cashier attention event without staring at the board, then act on the live queue/UI.
- Change type: behavior contract for operational audio. Runtime code must follow this before adding new spoken alerts.
- Primitives: existing POS/KDS chrome toggles; no new floating “bell” chrome; no durable notification rows for these events.

## Decision Summary

Operational audio is a **fourth feedback channel**, separate from toast, durable in-app notifications, and Telegram/outbox:

| Channel | Durability | Audience | Owner doc |
| --- | --- | --- | --- |
| Toast | Ephemeral UI | Current operator action | `docs/spec/toast-notification-system.md` |
| Durable notification | Persisted row | Role/branch feed | `docs/agent/rules/notifications.md` |
| Foreground popup | OS popup while PWA open | Same as durable feed | toast + notifications docs |
| **Operational audio** | Ephemeral device sound | Open POS/KDS device | **this spec** |

Do not collapse channels. A spoken kitchen alert is not an audit trail and not a Telegram message.

## Authority

1. Architecture decision: `docs/plan/adr/0008-operational-audio-alerts.md`
2. Alert entrypoint + mode resolution: `apps/web/lib/operational-audio.ts`
3. Beep runtime: `apps/web/lib/audio-signal.ts`
4. KDS alert taxonomy: `apps/web/app/(protected)/br/[branchId]/kds/_lib/sound-alerts.ts`
5. Device prefs helper: `apps/web/lib/device-prefs.ts` (+ `scripts/check-client-storage.mjs` allowlist)
6. Channel boundary: `docs/spec/toast-notification-system.md`, `docs/agent/rules/notifications.md`

## Core Model

```text
Board/realtime event on open POS or KDS
  -> classify stable alert kind
  -> read device audio mode (off | beep | voice | beep+voice)
  -> if mode includes beep: play mapped SignalTone (debounce)
  -> if mode includes voice: speak the short template via speechSynthesis (single-flight + coalesce)
  -> UI toast/board update remains independent
```

### Non-goals

- No cloud/realtime TTS
- No pre-recorded clip pack in MVP (a brand voice pack is a later phase)
- No reading full menu item lists in MVP
- No server-synced audio prefs
- No `public.notifications` insert for operational audio
- No Runner audio unless a later ADR says so

## Alert Catalog

Stable `kind` strings. Beep mapping reuses existing `SignalTone` values where they already exist.

### KDS (MVP — ship first)

| kind | When | Beep tone | Voice template (VI) | Priority |
| --- | --- | --- | --- | --- |
| `kds.new` | New kitchen send (non-append, non-add-on) | `kds-new` | “Phiếu mới{location}” | 0 |
| `kds.append` | Append batch | `kds-append` | “Gọi thêm{location}” | 1 |
| `kds.add_on` | Add-on item category | `kds-add-on` | “Món thêm{location}” | 2 |

Classification MUST stay aligned with `getKdsNewTicketSignalTone` / toast titles in `sound-alerts.ts`. If taxonomy drifts, fix both sides in one change.

`{location}` is optional. Use “ bàn {table}” only when a real table number is
available; for takeaway, delivery, or missing/ambiguous table metadata, speak the
base phrase without a location. Never invent a table or order label.

### POS (phase 3 — contract reserved; beep tones live)

| kind | When | Beep tone | Voice template (VI) | Notes |
| --- | --- | --- | --- | --- |
| `pos.self_order` | New QR self-order needs approval | `pos-self-order` | “Khách tự gọi” | Distinct from POS order ping |
| `pos.payment_call` | Guest cash call / VietQR payment request | `pos-payment-call` | “Gọi thanh toán” | Distinct from POS order ping |
| `pos.print_failed` | Print job failed | `pos` | “In lỗi” | Critical attention |
| `pos.out_of_stock` | KDS marked item unavailable | `pos` | “Hết món” | Keep short; detail stays on UI |

Do not add voice for every POS ping. Routine cart/sync noise stays beep-only or silent per mode. QR self-order and payment-call MUST use their dedicated tones so cashiers do not confuse them with ordinary POS order/sync beeps (`pos`).

## Audio Modes

| Mode | Beep | Voice | Default? |
| --- | --- | --- | --- |
| `off` | no | no | **yes for missing / unset prefs** |
| `beep` | yes | no | **yes when audio is enabled** |
| `voice` | no | yes | no |
| `beep+voice` | yes | yes | no — opt-in after kitchen validation |

Operational audio is never auto-enabled for a device. Missing new-mode and
legacy prefs resolve to `off`; when an operator enables audio for the first time,
the enabled default is `beep`.

### Preference keys

Device-local only:

- KDS mode: `kds:audio-mode:{branchId}` → one of `off|beep|voice|beep+voice`
- POS mode: `pos:audio-mode:{branchId}` → same enum

Compatibility with legacy boolean prefs:

| Legacy key | Legacy value | Resolved mode |
| --- | --- | --- |
| `kds:sound:{branchId}` / `pos:sound:{branchId}` | `"1"` | `beep` |
| same | missing / other | `off` |

When writing the new mode key, implementations MAY leave or clear the legacy key, but reads MUST prefer `*:audio-mode:*` when present.

KDS chrome exposes the mode through one cycling button: `off → beep → beep+voice → off`. `voice`-only is a valid stored mode (reads resolve it, playback honors it) but the chrome does not offer it; a dedicated mode control may expose it later. Enabling audio still requires a user gesture so `AudioContext` / `speechSynthesis` can start — the cycle button previews the newly selected mode, which doubles as that gesture.

## Playback Rules

1. **Single entrypoint.** Feature code calls one helper (name illustrative): `playOperationalAlert({ kind, slots?, force? })`. Direct `playAppSignal` remains valid for beep-only internals and tests, but new product call sites should use the entrypoint.
2. **Beep debounce.** Keep the existing ~2.5s per-tone debounce unless a call passes `force` (e.g. toggle preview).
3. **Voice single-flight.** At most one voice utterance plays at a time per page runtime.
4. **Coalesce.** If multiple KDS alert groups become ready in one sync tick, play one beep for the highest-priority kind (existing `pickHigherPriorityKdsSignalTone` behavior) and at most one voice line for that tick. Under sustained burst, prefer “N phiếu mới” summary clips over reading every table.
5. **Length budget.** Target ≤ ~1.5s per utterance in MVP. Reject copy that needs a sentence.
6. **Failure fallback.** No `vi-*` voice on the device, speech error, or autoplay block → skip voice; beep still follows mode. Never throw into UI.
7. **No overlap wars.** Starting a higher-priority voice MAY cut the current voice; lower-priority waiting items may be dropped when coalesced.

## Voice Engine Contract

- Engine: `window.speechSynthesis` with `SpeechSynthesisUtterance`. No audio assets ship with the app.
- Locale: `lang = "vi-VN"`. When the device exposes a loaded voice list, bind the first `vi-*` voice; when that list is loaded and holds no `vi-*` voice, skip voice for the event. An empty list means voices have not loaded yet — speak and let the engine choose.
- Table numbers are string interpolation on the template, not concatenated assets. The utterance builder MUST be a pure, unit-tested function.
- Rate is tuned for kitchen noise, not naturalness; keep utterances inside the length budget above.
- A recorded brand voice pack may replace this engine later; `kind` strings and templates stay stable.

## Surface Rules

### KDS

- Live board remains the source of truth; audio only calls attention.
- Sound/mode control stays in KDS chrome: the existing chuông button cycles the mode and carries a mode-aware `aria-label`.
- Toast titles for new-ticket groups stay aligned with voice kind (`getKdsNewTicketToastTitle`).

### POS

- Phase 3 only for voice.
- Do not voice-spam payment/cart churn.
- Print-failure and self-order approval may combine beep + short voice when mode allows.

### Other surfaces

- Admin, inventory, employee hub, Runner: no operational audio under this contract.

## API Shape (normative intent)

```ts
type OperationalAudioMode = "off" | "beep" | "voice" | "beep+voice";

// POS kinds join this union when phase 3 lands.
type OperationalAlertKind = "kds.new" | "kds.append" | "kds.add_on";

type PlayOperationalAlertInput = {
  kind: OperationalAlertKind;
  mode: OperationalAudioMode; // the surface owns the pref state
  slots?: { tableLabel?: string };
  force?: boolean; // preview / ignore debounce
};

// playOperationalAlert(input): void
// - no-op when mode is off
// - never throws
// - never touches notifications tables
```

`OperationalAlertKind` is a local audio namespace only. These values MUST NOT be
registered in the durable notification `kind` registry unless a separate
notification producer is explicitly designed.

Exact module path is an implementation detail; keep it under `apps/web/lib/` next to `audio-signal.ts` / `device-prefs.ts`.

## Acceptance Criteria

### Phase 1 (KDS MVP)

- [x] With mode `beep`, behavior matches today’s KDS tones and debounce.
- [x] With mode `beep+voice`, each of the three KDS kinds speaks the fixed template (base phrase when the table slot is unavailable).
- [x] With mode `voice`, no beep; voice still single-flight.
- [x] With mode `off`, silence.
- [x] Burst of tickets in one tick does not stack overlapping full utterances.
- [x] Legacy `kds:sound=1` still enables beep after upgrade before the new key is written.
- [x] Unit tests cover kind classification, priority, coalesce, and mode resolution.
- [x] No inserts into `public.notifications` from the audio path.

### Phase 3 (POS)

- [ ] Only the reserved POS kinds speak.
- [ ] Existing POS beep call sites keep working under mode `beep`.

## Verification

- Targeted: `apps/web/tests/operational-audio.test.ts` (mode resolution, cycle, utterance builder, kind map) + `apps/web/tests/kds-sound-alerts.test.ts` (classification, priority, coalesce).
- Manual kitchen smoke: enable audio on a real tablet, verify the autoplay gesture, that a `vi-VN` voice exists, rush-hour coalesce, and the off switch.
- Full gate before marking implementation complete: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build` (plus relevant tests).

## Review Tier

Implementing this contract is **T2** (new operational UX behavior, no money/RLS/schema). Escalate to **T3** only if a future change couples audio to durable notifications, server prefs, or schema.
