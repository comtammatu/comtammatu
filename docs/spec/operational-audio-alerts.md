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
4. Voice: `…/operational-voice.ts` + `/api/operational-audio/speak`
5. KDS taxonomy: `…/kds/_lib/sound-alerts.ts`
6. Prefs: `apps/web/lib/device-prefs.ts` (+ `scripts/check-client-storage.mjs`)

## Core Model

```text
Board/realtime event on open POS|KDS
  → classify stable alert kind
  → device mode (off | beep | voice | beep+voice)
  → beep: mapped SignalTone (debounce)
  → voice: cached cloud clip (single-flight; miss stays silent)
  → UI toast/board independent
```

**Non-goals:** uncached live TTS on the beep path; clip pack MVP; full menu
readouts; server-synced prefs; `public.notifications`; Pickup display audio.

## Alert Catalog

### KDS

| kind | When | Beep | Voice (VI) | Priority |
| --- | --- | --- | --- | --- |
| `kds.new` | New kitchen send (non-append, non-add-on) | `kds-new` | “Phiếu mới{location}” | 0 |
| `kds.append` | Append batch | `kds-append` | “Gọi thêm{location}” | 1 |
| `kds.add_on` | Add-on item category | `kds-add-on` | “Món thêm{location}” | 2 |

Align with `getKdsNewTicketSignalTone` / alert kinds in `sound-alerts.ts`.
`{location}` = “ bàn {table}” only with a real table number; never invent labels.

### POS

| kind | When | Beep | Voice (VI) |
| --- | --- | --- | --- |
| `pos.self_order` | QR request needs approval | `pos-self-order` | “Bàn {n} cần duyệt đơn” |
| `pos.payment_call` | Guest cash / VietQR call | `pos-payment-call` | “Bàn {n} gọi thanh toán” |
| `pos.staff_call` | Guest calls staff | `pos-staff-call` | “Bàn {n} gọi nhân viên” |
| `pos.payment_received` | VietQR → `paid` | `pos-payment-received` | “Đã nhận {amount} thanh toán bàn {n}” |
| `pos.print_failed` | Print job failed | `pos` | “In lỗi” |
| `pos.out_of_stock` | KDS marked unavailable | `pos` | “Hết món” |

QR guest events use dedicated tones. One poll tick plays one guest alert
(payment call > self-order > staff call). Cashier-confirmed cash stays silent.
Store finite table lines including “Bàn {n} gọi món” (not a live POS kind yet).
Do not prefetch every VND total: round to 1,000₫, speak Vietnamese words on
demand, LRU ~80 amount clips. Takeaway omits the table slot. Kitchen send,
append, add-on, ready, and cancel stay silent on POS (ready/cancel may toast).

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
supplies the user gesture for `AudioContext`.

## Playback Rules

1. **Single entrypoint** — `playOperationalAlert({ kind, slots?, force? })`. Direct `playAppSignal` OK for beep-only internals/tests.
2. **Beep debounce** — ~2.5s per-tone unless `force` (preview).
3. **Voice single-flight** — one utterance per page runtime.
4. **Coalesce** — one sync tick: one beep (highest-priority kind) + at most one voice. KDS voice 15s quiet window (beep/toast/queue continue; no delayed speak). Mode preview bypasses window.
5. **Length** — catalog ≤ ~1.5s; paid-amount speech may run longer.
6. **Failure** — cloud 503 / 429 / timeout / autoplay → skip voice; beep still follows mode; never throw to UI.
7. **Priority** — higher-priority voice MAY cut current; lower waiting may drop when coalesced.
8. **Sequential** — in `beep+voice`: finish beep, wait 120 ms, then speak. Newer alert replaces voice still waiting.

## Voice / surfaces / API

Engine: AI SDK `generateSpeech` + Gateway `openai/tts-1` `nova` at 1.15x
(no OS TTS). Fetch with the beep; play after 120 ms. Miss → beep only.
Allowlisted templates only. POS prefetches that branch’s table lines slowly
(2s gap, one in-flight run, shared 20/min limiter), not 1–99 and not totals.
Cycle preview prefetches generics. Gateway 429 maps to HTTP 429.

- **KDS:** board = SoT; bell cycles mode; voice kind aligns with signal tone.
- **POS:** catalog kinds speak; guest events coalesce per tick; VietQR paid speaks amount plus table.
- **Other:** Owner / inventory / employee / pickup display — no operational audio.

```ts
type OperationalAudioMode = "off" | "beep" | "voice" | "beep+voice";
type OperationalAlertKind =
  | "kds.new" | "kds.append" | "kds.add_on"
  | "pos.self_order" | "pos.payment_call" | "pos.staff_call"
  | "pos.payment_received" | "pos.print_failed" | "pos.out_of_stock";
// playOperationalAlert({ kind, mode, slots?, force? }): void
```

Audio-namespace only. Tests: `operational-audio.test.ts`,
`vnd-vietnamese-speech.test.ts`, `operational-audio-tts-static.test.ts`.
Gate: typecheck + lint + build. **T2**. History → ADR 0008.
