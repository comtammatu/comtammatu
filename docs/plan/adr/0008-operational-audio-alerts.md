# ADR 0008 — Operational Audio Alerts (Beep + Voice)

**Status:** Accepted (2026-07-09; amended 2026-07-10/11; guest-tone split 2026-08-19; cached cloud TTS 2026-08-19; table-clip cache + spoken paid amount 2026-08-19)

**Decision drivers:** Kitchen/POS need eyes-free attention during service; current Web Audio beeps are reliable but content-blind; a recorded clip pack ships no voice until someone records it.

## Context

POS and KDS already ship device-local sound alerts:

- Runtime beep engine: `apps/web/lib/audio-signal.ts` (`playAppSignal`, `SignalTone`)
- KDS taxonomy: `kds-new` / `kds-append` / `kds-add-on` in `apps/web/app/(protected)/br/[branchId]/kds/_lib/sound-alerts.ts`
- POS baseline tone `pos` for order sync / stock / print-failure; QR guest events use dedicated `pos-self-order`, `pos-payment-call`, and `pos-staff-call`; confirmed payment uses `pos-payment-received`
- Prefs are device-local via `apps/web/lib/device-prefs.ts` (`kds:audio-mode:{branchId}`, `pos:audio-mode:{branchId}`)

Owner direction: add spoken Vietnamese alerts (“Má Tư voice”) instead of relying only on beeps. The open product question was whether TTS should **replace** beeps.

Constraints that matter in-store:

- Kitchen noise and concurrent tickets favor short, predictable audio
- Browser autoplay still requires an explicit enable gesture (unchanged)
- `speechSynthesis` Vietnamese quality and latency vary by OS/browser/tablet
- Durable `notifications`, external delivery, and foreground popup are a different channel (`docs/spec/toast-notification-system.md`)

## Decision

1. **Layered audio, not replacement.** Beep remains the attention ping. Voice is an optional content layer on top. Modes: `off` | `beep` | `voice` | `beep+voice`. Audio remains opt-in per device: a missing preference resolves to `off`, and the first enabled mode is **`beep`** (current audible behavior). Voice stays opt-in until a surface passes in-store validation.

2. **Device-local operational audio only.** Audio alerts fire on the open POS/KDS surface that already owns the event. They MUST NOT write `public.notifications`, MUST NOT use Telegram/outbox, and MUST NOT sync prefs to the server. Prefs stay in `device-prefs` (allowed exception in `scripts/check-client-storage.mjs`).

3. **Cached cloud TTS only** (amended 2026-08-19). Catalog templates speak through AI SDK **`generateSpeech`** + AI Gateway **`openai/tts-1`** voice **`nova`** (locked; not env-switched) when `AI_GATEWAY_API_KEY` or Vercel OIDC is present. Do not hand-roll `/v4/ai/speech-model`; the SDK owns the protocol version header. Clips cache on the device and play at 1.15x through Web Audio. The beep never waits on the network. Unconfigured or failed cloud TTS stays silent (beep still follows mode). Do not use OS `speechSynthesis`. Free-form text is rejected. A recorded brand pack may still replace the engine later without changing `kind`s.

4. **KDS first, POS critical events second.** KDS ships the three existing alert kinds with short fixed copy (event type + table label). POS speaks self-order approval, guest payment call, staff call, VietQR paid, print failure, and out-of-stock. Persist finite “Bàn {n} …” clips for the open branch (including stored “gọi món”). VietQR paid speaks “Đã nhận {Vietnamese amount} thanh toán bàn {n}” on demand — round to 1,000₫, LRU the clip, do not prefetch every total. Takeaway omits the table. Cashier-confirmed cash does not play `pos.payment_received`. Do not read item lists or routine POS state transitions. POS guest beeps must not reuse KDS ticket contours.

5. **Single playback API.** New call sites go through one operational-alert entrypoint (e.g. `playOperationalAlert`) that:
   - classifies a stable `kind`
   - plays the mapped beep when mode includes beep
   - enqueues at most one voice utterance at a time when mode includes voice
   - coalesces bursts (e.g. many new tickets → one summary or highest-priority kind)
   - preserves the existing per-tone debounce spirit from `playAppSignal`

6. **Copy is template-fixed.** No free-form LLM speech. A recorded brand voice pack ("Má Tư voice") may replace the TTS engine later without changing `kind`s.

7. **KDS voice has a 15-second quiet window.** Beeps remain immediate. Spoken KDS alerts inside the window are dropped rather than queued, so a rush cannot create delayed narration that no longer matches the board. User-triggered previews bypass the window and do not postpone the next live alert.

8. **Beep and voice do not overlap.** In `beep+voice`, start the cloud fetch with the beep, finish the mapped beep, leave 120 ms, then play the clip. A newer alert replaces any voice still waiting. `voice`-only starts immediately.

## Alternatives Rejected

**A. Replace beeps entirely with TTS**

- Rejected: longer latency, worse pile-up under rush, harder to hear than a short ping when speech overlaps.

**B. Pre-recorded clip pack as primary engine**

- Rejected (2026-07-10): the pack needs recording, asset discipline, and digit concatenation before a single line can play. Voice quality is device-dependent under TTS, but a device with no Vietnamese voice degrades to today's beep, which is the current shipped behavior anyway.

**C. Uncached live cloud TTS on the beep path**

- Rejected: network and latency during service peaks. Cached catalog overlay via AI Gateway is accepted (2026-08-19): beep stays local; voice fetch overlaps the beep and stays silent if the clip misses.

**D. Route kitchen audio through `public.notifications`**

- Rejected: wrong durability and audience model; kitchen attention is ephemeral and board-local.

**E. `tts-1-hd` or an env-switched speech model**

- Rejected (2026-08-19): Gateway speech is OpenAI-only; `tts-1` is the cheapest listed OpenAI speech model. Spend is saved by clip cache, not HD. Hand-rolled REST without `ai-speech-model-specification-version` returns 400 `Unsupported gateway protocol version`.

## Consequences

**Positive**

- Beep reliability is preserved; voice is additive and kill-switchable per device.
- Stable `kind` catalog lets UI, tests, and a future voice pack evolve independently.
- Clear boundary from toast / durable notification / Telegram channels.
- No bundled audio assets: cloud clips cache on the device after first speak.

**Negative / trade-offs**

- Unconfigured or failed cloud TTS stays beep-only; there is no OS voice fallback.
- Voice-on-by-default is intentionally deferred until kitchen smoke feedback.
- A recorded brand voice pack and Runner audio stay optional / out of scope until a separate decision.

Normative runtime contract: `docs/spec/operational-audio-alerts.md`.
