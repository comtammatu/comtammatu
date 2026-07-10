"use client";

import { playAppSignal, type SignalTone } from "./audio-signal";

export type OperationalAudioMode = "off" | "beep" | "voice" | "beep+voice";

export type OperationalAlertKind = "kds.new" | "kds.append" | "kds.add_on";

export interface PlayOperationalAlertInput {
  kind: OperationalAlertKind;
  mode: OperationalAudioMode;
  slots?: { tableLabel?: string | undefined };
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

const ALERT_TONES: Record<OperationalAlertKind, SignalTone> = {
  "kds.new": "kds-new",
  "kds.append": "kds-append",
  "kds.add_on": "kds-add-on",
};

const ALERT_PHRASES: Record<OperationalAlertKind, string> = {
  "kds.new": "Phiếu mới",
  "kds.append": "Gọi thêm",
  "kds.add_on": "Món thêm",
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

export function getKdsSoundPrefKey(branchId: number): string {
  return `kds:sound:${String(branchId)}`;
}

export function resolveAudioMode(
  storedMode: string | null,
  legacySound: string | null,
): OperationalAudioMode {
  const known = AUDIO_MODES.find((mode) => mode === storedMode);
  if (known !== undefined) return known;
  return legacySound === "1" ? "beep" : "off";
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

export function buildAlertUtterance(
  kind: OperationalAlertKind,
  tableLabel?: string | undefined,
): string {
  const phrase = ALERT_PHRASES[kind];
  const table = tableLabel?.trim();
  return table ? `${phrase} bàn ${table}` : phrase;
}

function speak(text: string): void {
  const synth = window.speechSynthesis as SpeechSynthesis | undefined;
  if (!synth) return;

  const voices = synth.getVoices();
  const vietnamese = voices.find((voice) => voice.lang.startsWith("vi"));
  // An empty list means voices have not loaded yet; let the engine pick.
  // A loaded list without Vietnamese would read the copy with a wrong locale.
  if (voices.length > 0 && vietnamese === undefined) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "vi-VN";
  utterance.rate = 1.1;
  if (vietnamese) utterance.voice = vietnamese;
  // Single-flight: a newer alert cuts the line still speaking.
  synth.cancel();
  synth.speak(utterance);
}

export function playOperationalAlert(input: PlayOperationalAlertInput): void {
  const { kind, mode, slots, force = false } = input;
  if (mode === "off") return;

  if (audioModeHasBeep(mode)) {
    playAppSignal(ALERT_TONES[kind], force);
  }

  if (!audioModeHasVoice(mode)) return;
  try {
    speak(buildAlertUtterance(kind, slots?.tableLabel));
  } catch {
    // Speech unavailable or blocked by the browser; the beep already fired.
  }
}
