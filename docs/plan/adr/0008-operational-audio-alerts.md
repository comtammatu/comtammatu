# ADR 0008 — Operational Audio Alerts (Beep + Voice)

**Status:** Accepted

Runtime: [`docs/spec/operational-audio-alerts.md`](../../spec/operational-audio-alerts.md).
This ADR owns layered device-local audio; not the toast/notification channel.

## Decision

1. **Layered, not replacement.** Beep is the attention ping; voice is optional
   content. Modes: `off` | `beep` | `voice` | `beep+voice`. Missing preference
   is `off`; first enabled mode is **`beep`**.
2. **Device-local only.** Alerts fire on the open POS/KDS surface. They must
   not write `public.notifications`, use Telegram/outbox, or sync prefs to the
   server.
3. **Cached cloud TTS only** via AI Gateway allowlist (`openai/tts-1`,
   `fish-audio/s2.1-pro`). Only live alerts synthesize. Beep never waits on
   the network. No OS `speechSynthesis`. Free-form text is rejected.
4. **KDS first**, POS critical events second. Do not read item lists or routine
   POS kitchen-echo transitions.
5. One playback API (`playOperationalAlert`): stable `kind`, at most one voice
   utterance, coalesced bursts.
6. KDS voice has a 15-second quiet window (beeps stay immediate). In
   `beep+voice`, finish the beep, wait 120 ms, then play the clip.

Rejected: replacing beeps with TTS; uncached live TTS on the beep path;
routing kitchen audio through `public.notifications`.
