# Operational Audio Alerts

> Status: design contract | Updated: 2026-07-09 | Scope: device-local beep + voice alerts on open POS/KDS surfaces\
> Decision: `docs/plan/adr/0008-operational-audio-alerts.md`

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
2. Current beep runtime: `apps/web/lib/audio-signal.ts`
3. KDS alert taxonomy: `apps/web/app/(protected)/br/[branchId]/kds/_lib/sound-alerts.ts`
4. Device prefs helper: `apps/web/lib/device-prefs.ts` (+ `scripts/check-client-storage.mjs` allowlist)
5. Channel boundary: `docs/spec/toast-notification-system.md`, `docs/agent/rules/notifications.md`

## Core Model

```text
Board/realtime event on open POS or KDS
  -> classify stable alert kind
  -> read device audio mode (off | beep | voice | beep+voice)
  -> if mode includes beep: play mapped SignalTone (debounce)
  -> if mode includes voice: enqueue short pre-recorded utterance (single-flight + coalesce)
  -> UI toast/board update remains independent
```

### Non-goals

- No live `speechSynthesis` as primary engine
- No cloud/realtime TTS in MVP
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
available; for takeaway, delivery, or missing/ambiguous table metadata, use the
base clip without a location (or beep-only if the base clip is missing). Never
invent a table or order label.

### POS (phase 3 — contract reserved)

| kind | When | Beep tone | Voice template (VI) | Notes |
| --- | --- | --- | --- | --- |
| `pos.self_order` | New self-order needs approval | `pos` | “Khách tự gọi” | Critical attention |
| `pos.print_failed` | Print job failed | `pos` | “In lỗi” | Critical attention |
| `pos.out_of_stock` | KDS marked item unavailable | `pos` | “Hết món” | Keep short; detail stays on UI |

Do not add voice for every POS ping. Routine cart/sync noise stays beep-only or silent per mode.

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

UI chrome may keep a simple toggle for MVP (map checked → `beep` or last non-off mode; unchecked → `off`) and expand to an explicit mode control later. Enabling audio still requires a user gesture so `AudioContext` / media can start (preview beep/voice on enable is allowed and recommended).

## Playback Rules

1. **Single entrypoint.** Feature code calls one helper (name illustrative): `playOperationalAlert({ kind, slots?, force? })`. Direct `playAppSignal` remains valid for beep-only internals and tests, but new product call sites should use the entrypoint.
2. **Beep debounce.** Keep the existing ~2.5s per-tone debounce unless a call passes `force` (e.g. toggle preview).
3. **Voice single-flight.** At most one voice utterance plays at a time per page runtime.
4. **Coalesce.** If multiple KDS alert groups become ready in one sync tick, play one beep for the highest-priority kind (existing `pickHigherPriorityKdsSignalTone` behavior) and at most one voice line for that tick. Under sustained burst, prefer “N phiếu mới” summary clips over reading every table.
5. **Length budget.** Target ≤ ~1.5s per utterance in MVP. Reject copy that needs a sentence.
6. **Failure fallback.** Missing asset, decode error, or autoplay block → skip voice; beep still follows mode. Never throw into UI.
7. **No overlap wars.** Starting a higher-priority voice MAY cut the current voice; lower-priority waiting items may be dropped when coalesced.

## Clip Pack Contract

- Engine: pre-recorded static assets served with the web app (e.g. `apps/web/public/audio/alerts/…` or an equivalent bundled path).
- Format: short MP3 or WAV; keep files small for kitchen tablets.
- Pack layout (illustrative):

```text
audio/alerts/
  kds-new.mp3
  kds-append.mp3
  kds-add-on.mp3
  ban.mp3                 # optional “bàn” glue clip
  digits/0.mp3 … 9.mp3    # or a documented alternate slot strategy
  pos-self-order.mp3      # phase 3
  pos-print-failed.mp3
  pos-out-of-stock.mp3
```

- Table numbers: concatenate approved digit/glue clips, or use a finite set of prebuilt phrases for the branch’s real table range. Either strategy is allowed; the chosen strategy MUST be deterministic and unit-tested.
- Brand packs may replace file bytes later; `kind` and templates stay stable.
- Live `speechSynthesis` is reserved only as an unshipped experiment behind an explicit future decision — not a fallback in production MVP.

## Surface Rules

### KDS

- Live board remains the source of truth; audio only calls attention.
- Sound/mode control stays in KDS chrome (existing chuông control evolves to mode-aware labeling).
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

type OperationalAlertKind =
  | "kds.new"
  | "kds.append"
  | "kds.add_on"
  | "pos.self_order"
  | "pos.print_failed"
  | "pos.out_of_stock";

type PlayOperationalAlertInput = {
  kind: OperationalAlertKind;
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

- [ ] With mode `beep`, behavior matches today’s KDS tones and debounce.
- [ ] With mode `beep+voice`, each of the three KDS kinds speaks the fixed template (or beep-only if table slot unavailable).
- [ ] With mode `voice`, no beep; voice still single-flight.
- [ ] With mode `off`, silence.
- [ ] Burst of tickets in one tick does not stack overlapping full utterances.
- [ ] Legacy `kds:sound=1` still enables beep after upgrade before the new key is written.
- [ ] Unit tests cover kind classification, priority, coalesce, and mode resolution.
- [ ] No inserts into `public.notifications` from the audio path.

### Phase 3 (POS)

- [ ] Only the reserved POS kinds speak.
- [ ] Existing POS beep call sites keep working under mode `beep`.

## Verification

- Targeted: extend `apps/web/tests/kds-sound-alerts.test.ts` (and add mode/queue tests beside it).
- Manual kitchen smoke: enable audio on a real tablet, verify autoplay gesture, rush-hour coalesce, and off switch.
- Full gate before marking implementation complete: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build` (plus relevant tests).

## Review Tier

Implementing this contract is **T2** (new operational UX behavior, no money/RLS/schema). Escalate to **T3** only if a future change couples audio to durable notifications, server prefs, or schema.
