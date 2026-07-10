# ADR 0008 — Operational Audio Alerts (Beep + Voice)

**Status:** Accepted (2026-07-09) · Amended (2026-07-10, D074 — voice engine is browser TTS)
**Decision drivers:** Kitchen/POS need eyes-free attention during service; current Web Audio beeps are reliable but content-blind; a recorded clip pack ships no voice until someone records it.

## Context

POS and KDS already ship device-local sound alerts:

- Runtime beep engine: `apps/web/lib/audio-signal.ts` (`playAppSignal`, `SignalTone`)
- KDS taxonomy: `kds-new` / `kds-append` / `kds-add-on` in `apps/web/app/(protected)/br/[branchId]/kds/_lib/sound-alerts.ts`
- POS baseline tone `pos` for order sync / stock / print-failure; QR guest events use dedicated `pos-self-order` and `pos-payment-call`
- Prefs are device-local via `apps/web/lib/device-prefs.ts` (`kds:sound:{branchId}`, `pos:sound:{branchId}`)

Owner direction: add spoken Vietnamese alerts (“Má Tư voice”) instead of relying only on beeps. The open product question was whether TTS should **replace** beeps.

Constraints that matter in-store:

- Kitchen noise and concurrent tickets favor short, predictable audio
- Browser autoplay still requires an explicit enable gesture (unchanged)
- `speechSynthesis` Vietnamese quality and latency vary by OS/browser/tablet
- Durable `notifications` / Telegram / foreground popup are a different channel (`docs/spec/toast-notification-system.md`, `docs/agent/rules/notifications.md`)

## Decision

1. **Layered audio, not replacement.** Beep remains the attention ping. Voice is an optional content layer on top. Modes: `off` | `beep` | `voice` | `beep+voice`. Audio remains opt-in per device: a missing preference resolves to `off`, and the first enabled mode is **`beep`** (current audible behavior). Voice stays opt-in until a surface passes in-store validation.

2. **Device-local operational audio only.** Audio alerts fire on the open POS/KDS surface that already owns the event. They MUST NOT write `public.notifications`, MUST NOT use Telegram/outbox, and MUST NOT sync prefs to the server. Prefs stay in `device-prefs` (allowed exception in `scripts/check-client-storage.mjs`).

3. **Browser TTS is the voice engine** (amended 2026-07-10). Speak the template through `window.speechSynthesis` with `lang = "vi-VN"`. No audio assets, no bundle cost, and the table-number slot is plain string interpolation. When the device exposes a loaded voice list without any `vi-*` voice, skip voice for that event; beep still follows the mode. Cloud/realtime TTS stays rejected.

4. **MVP surface = KDS.** First ship the three existing KDS alert kinds with short fixed copy (event type + table label). Do not read full item lists in MVP. POS critical alerts (self-order approval, print failure, out-of-stock) are a later phase under the same contract.

5. **Single playback API.** New call sites go through one operational-alert entrypoint (e.g. `playOperationalAlert`) that:
   - classifies a stable `kind`
   - plays the mapped beep when mode includes beep
   - enqueues at most one voice utterance at a time when mode includes voice
   - coalesces bursts (e.g. many new tickets → one summary or highest-priority kind)
   - preserves the existing per-tone debounce spirit from `playAppSignal`

6. **Copy is template-fixed.** No free-form LLM speech. A recorded brand voice pack ("Má Tư voice") may replace the TTS engine later without changing `kind`s.

## Alternatives Rejected

**A. Replace beeps entirely with TTS**

- Rejected: longer latency, worse pile-up under rush, harder to hear than a short ping when speech overlaps.

**B. Pre-recorded clip pack as primary engine**

- Rejected (2026-07-10): the pack needs recording, asset discipline, and digit concatenation before a single line can play. Voice quality is device-dependent under TTS, but a device with no Vietnamese voice degrades to today's beep, which is the current shipped behavior anyway.

**C. Cloud / realtime TTS**

- Rejected for MVP: network dependency, cost, and latency during service peaks.

**D. Route kitchen audio through `public.notifications`**

- Rejected: wrong durability and audience model; kitchen attention is ephemeral and board-local.

## Consequences

**Positive**

- Beep reliability is preserved; voice is additive and kill-switchable per device.
- Stable `kind` catalog lets UI, tests, and a future voice pack evolve independently.
- Clear boundary from toast / durable notification / Telegram channels.
- Zero audio assets: voice ships the day the code lands.

**Negative / trade-offs**

- Vietnamese voice quality, rate, and latency vary by OS/browser; a device without a `vi-*` voice gets beep only.
- Legacy boolean prefs (`kds:sound`, `pos:sound`) need a compatibility map into the new mode enum.
- Voice-on-by-default is intentionally deferred until kitchen smoke feedback.

## Implementation Phases (non-normative schedule)

| Phase | Scope |
| --- | --- |
| 1 | Catalog + mode prefs; KDS 3 kinds; `speechSynthesis` voice; wire beside current `playAppSignal` |
| 2 | In-store tune (length, coalesce, volume); keep default `beep` unless owner flips |
| 3 | POS critical kinds only |
| 4 | Optional recorded brand voice pack |

Normative runtime contract: `docs/spec/operational-audio-alerts.md`.

## Open Items

- Whether a recorded brand voice pack replaces TTS stays open until kitchen smoke feedback on real tablets.
- Whether Runner ever gets audio remains out of scope until a separate decision.
