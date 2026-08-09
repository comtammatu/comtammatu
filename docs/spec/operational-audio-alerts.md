# Operational Audio Alerts

> Status: implemented contract | Scope: device-local beep + voice on open POS/KDS\
> Historical decision detail: `docs/plan/adr/0008-operational-audio-alerts.md`

## Scope + channel boundary

Surfaces: `/br/[branchId]/kds` + selected POS critical events. No new “bell”
chrome; no durable notification rows. Fourth feedback channel — do not collapse
with toast / durable / Telegram (`docs/spec/toast-notification-system.md`).

| Channel | Durability | Audience |
| --- | --- | --- |
| Toast / durable / foreground popup | Ephemeral or persisted feed | Operator / role-branch |
| **Operational audio** | Ephemeral device sound | Open POS/KDS device |

## Authority

1. ADR: `docs/plan/adr/0008-operational-audio-alerts.md`
2. Entrypoint + mode: `apps/web/lib/operational-audio.ts`
3. Beep: `apps/web/lib/audio-signal.ts`
4. KDS taxonomy: `…/kds/_lib/sound-alerts.ts`
5. Prefs: `apps/web/lib/device-prefs.ts` (+ `scripts/check-client-storage.mjs`)

## Core Model

```text
Board/realtime event on open POS|KDS
  → classify stable alert kind
  → device mode (off | beep | voice | beep+voice)
  → beep: mapped SignalTone (debounce)
  → voice: speechSynthesis template (single-flight + coalesce)
  → UI toast/board independent
```

**Non-goals:** cloud/realtime TTS; clip pack MVP; full menu readouts;
server-synced prefs; `public.notifications` inserts; Runner audio (needs ADR).

## Alert Catalog

### KDS

| kind | When | Beep | Voice (VI) | Priority |
| --- | --- | --- | --- | --- |
| `kds.new` | New kitchen send (non-append, non-add-on) | `kds-new` | “Phiếu mới{location}” | 0 |
| `kds.append` | Append batch | `kds-append` | “Gọi thêm{location}” | 1 |
| `kds.add_on` | Add-on item category | `kds-add-on` | “Món thêm{location}” | 2 |

Align with `getKdsNewTicketSignalTone` / toast titles in `sound-alerts.ts`.
`{location}` = “ bàn {table}” only with a real table number; never invent labels.

### POS

| kind | When | Beep | Voice (VI) | Notes |
| --- | --- | --- | --- | --- |
| `pos.self_order` | New QR self-order needs approval | `pos-self-order` | “Khách tự gọi” | Distinct from POS order ping |
| `pos.payment_received` | Table order → `paid` | `pos` | “Bàn {table} đã thanh toán” | Real table only |
| `pos.print_failed` | Print job failed | `pos` | “In lỗi” | Critical |
| `pos.out_of_stock` | KDS marked unavailable | `pos` | “Hết món” | Detail on UI |

No voice for every POS ping. QR self-order + payment-call beeps use dedicated
tones (`pos-self-order` / `pos-payment-call`); payment-call does not speak —
only confirmed table payment does.

## Audio Modes

| Mode | Beep | Voice | Default |
| --- | --- | --- | --- |
| `off` | no | no | **missing / unset prefs** |
| `beep` | yes | no | **first enable** |
| `voice` | no | yes | no |
| `beep+voice` | yes | yes | opt-in |

Never auto-enable. Keys (device-local): `kds:audio-mode:{branchId}`,
`pos:audio-mode:{branchId}` → `off|beep|voice|beep+voice`. KDS chrome cycles
`off → beep → beep+voice → off` (`voice`-only valid if stored). Cycle preview
supplies the user gesture for `AudioContext` / `speechSynthesis`.

## Playback Rules

1. **Single entrypoint** — `playOperationalAlert({ kind, slots?, force? })`. Direct `playAppSignal` OK for beep-only internals/tests.
2. **Beep debounce** — ~2.5s per-tone unless `force` (preview).
3. **Voice single-flight** — one utterance per page runtime.
4. **Coalesce** — one sync tick: one beep (highest-priority kind) + at most one voice. KDS voice 15s quiet window (beep/toast/queue continue; no delayed speak). Mode preview bypasses window.
5. **Length** — ≤ ~1.5s; reject sentence copy.
6. **Failure** — no `vi-*` / speech error / autoplay block → skip voice; beep still follows mode; never throw to UI.
7. **Priority** — higher-priority voice MAY cut current; lower waiting may drop when coalesced.
8. **Sequential** — in `beep+voice`: finish beep, wait 120 ms, then speak. Newer alert replaces voice still waiting.

## Voice / surfaces / API

Engine: `speechSynthesis` + `SpeechSynthesisUtterance`; `lang = "vi-VN"`; first
`vi-*` when list loaded (empty → speak; loaded no `vi-*` → skip). Templates
pure/unit-tested; volume `1`. Kinds stable if brand pack replaces engine later.

- **KDS:** board = SoT; bell cycles mode; toast titles align with voice kind.
- **POS:** only four catalog kinds speak; payment request beep-only; confirmed payment needs real table.
- **Other:** Owner / inventory / employee / Runner — no operational audio.

```ts
type OperationalAudioMode = "off" | "beep" | "voice" | "beep+voice";
type OperationalAlertKind =
  | "kds.new" | "kds.append" | "kds.add_on"
  | "pos.self_order" | "pos.payment_received" | "pos.print_failed" | "pos.out_of_stock";
// playOperationalAlert({ kind, mode, slots?, force? }): void — no-op off, never throws, no notifications tables
```

Audio-namespace only — not durable notification `kind` registry. Tests:
`operational-audio.test.ts`, `kds-sound-alerts.test.ts`. Gate: typecheck + lint
+ build. **T2**; escalate **T3** if durable notifications / server prefs /
schema. Acceptance history → ADR 0008.
