"use client";

import {
  getAppSignalDurationMs,
  playAppSignal,
  type SignalTone,
} from "./audio-signal";
import {
  buildAlertUtterance,
  selectPosGuestAlert,
  shouldAnnouncePaymentReceived,
  type OperationalAlertKind,
  type OperationalAlertSlots,
  type PosGuestAlertCandidate,
  type PosGuestAlertKind,
} from "./operational-audio-catalog";
import {
  cancelOperationalVoice,
  prefetchOperationalVoiceCatalog,
  primeOperationalVoice,
} from "./operational-voice";

export type OperationalAudioMode = "off" | "beep" | "voice" | "beep+voice";

export type {
  OperationalAlertKind,
  OperationalAlertSlots,
  PosGuestAlertCandidate,
  PosGuestAlertKind,
};
export {
  buildAlertUtterance,
  selectPosGuestAlert,
  shouldAnnouncePaymentReceived,
};

export const KDS_VOICE_COOLDOWN_MS = 15_000;
const VOICE_AFTER_BEEP_GAP_MS = 120;

export interface PlayOperationalAlertInput {
  kind: OperationalAlertKind;
  mode: OperationalAudioMode;
  slots?: OperationalAlertSlots;
  force?: boolean;
}

const AUDIO_MODES: readonly OperationalAudioMode[] = [
  "off",
  "beep",
  "voice",
  "beep+voice",
];

/** Cycle order for the single KDS chrome control; `voice`-only stays pref-only. */
const AUDIO_MODE_CYCLE: readonly OperationalAudioMode[] = [
  "off",
  "beep",
  "beep+voice",
];

let lastKdsVoiceAt = 0;
let pendingVoiceTimer: number | null = null;

export const OPERATIONAL_ALERT_TONES: Record<OperationalAlertKind, SignalTone> =
  {
    "kds.new": "kds-new",
    "kds.append": "kds-append",
    "kds.add_on": "kds-add-on",
    "pos.self_order": "pos-self-order",
    "pos.payment_call": "pos-payment-call",
    "pos.staff_call": "pos-staff-call",
    "pos.payment_received": "pos-payment-received",
    "pos.print_failed": "pos",
    "pos.out_of_stock": "pos",
  };

export const KDS_TONE_TO_ALERT_KIND: Record<
  Extract<SignalTone, "kds-new" | "kds-append" | "kds-add-on">,
  OperationalAlertKind
> = {
  "kds-new": "kds.new",
  "kds-append": "kds.append",
  "kds-add-on": "kds.add_on",
};

export function getKdsAudioModeKey(branchId: number): string {
  return `kds:audio-mode:${String(branchId)}`;
}

export function getPosAudioModeKey(branchId: number): string {
  return `pos:audio-mode:${String(branchId)}`;
}

export function resolveAudioMode(
  storedMode: string | null,
): OperationalAudioMode {
  const known = AUDIO_MODES.find((mode) => mode === storedMode);
  return known ?? "off";
}

export function cycleAudioMode(
  current: OperationalAudioMode,
): OperationalAudioMode {
  const index = AUDIO_MODE_CYCLE.indexOf(current);
  return AUDIO_MODE_CYCLE[(index + 1) % AUDIO_MODE_CYCLE.length] ?? "off";
}

export function audioModeHasBeep(mode: OperationalAudioMode): boolean {
  return mode === "beep" || mode === "beep+voice";
}

export function audioModeHasVoice(mode: OperationalAudioMode): boolean {
  return mode === "voice" || mode === "beep+voice";
}

export function shouldSpeakKdsVoice(
  nowMs: number,
  lastSpokenAtMs: number,
): boolean {
  return nowMs - lastSpokenAtMs >= KDS_VOICE_COOLDOWN_MS;
}

function cancelPendingSpeech(): void {
  if (pendingVoiceTimer !== null) {
    window.clearTimeout(pendingVoiceTimer);
    pendingVoiceTimer = null;
  }
  cancelOperationalVoice();
}

function scheduleSpeech(text: string, delayMs: number): void {
  cancelPendingSpeech();
  const primed = primeOperationalVoice(text);
  if (delayMs === 0) {
    primed.play();
    return;
  }
  pendingVoiceTimer = window.setTimeout(() => {
    pendingVoiceTimer = null;
    primed.play();
  }, delayMs);
}

export function playOperationalAlert(input: PlayOperationalAlertInput): void {
  const { kind, mode, slots, force = false } = input;
  cancelPendingSpeech();
  if (mode === "off") return;

  if (audioModeHasBeep(mode)) {
    playAppSignal(OPERATIONAL_ALERT_TONES[kind], force);
  }

  if (!audioModeHasVoice(mode)) return;
  if (kind.startsWith("kds.") && !force) {
    const now = Date.now();
    if (!shouldSpeakKdsVoice(now, lastKdsVoiceAt)) return;
    lastKdsVoiceAt = now;
  }
  if (force) {
    prefetchOperationalVoiceCatalog({
      surface: kind.startsWith("kds.") ? "kds" : "pos",
    });
  }
  try {
    const voiceDelayMs = audioModeHasBeep(mode)
      ? getAppSignalDurationMs(OPERATIONAL_ALERT_TONES[kind]) +
        VOICE_AFTER_BEEP_GAP_MS
      : 0;
    scheduleSpeech(buildAlertUtterance(kind, slots), voiceDelayMs);
  } catch {
    // Speech unavailable or blocked by the browser; the beep already fired.
  }
}
