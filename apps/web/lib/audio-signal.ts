"use client";

export type SignalTone =
  | "kds"
  | "kds-new"
  | "kds-append"
  | "kds-add-on"
  | "pos";
type AudioContextConstructor = new () => AudioContext;
type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
  };
export type SignalPattern = {
  frequencies: [number, number, number];
  pulses: number;
  pulseGapSeconds: number;
  pulseDurationSeconds: number;
  oscillatorType: OscillatorType;
};

let audioCtx: AudioContext | null = null;
let lastSignalAtByTone: Partial<Record<SignalTone, number>> = {};

const MIN_SIGNAL_INTERVAL_MS = 2_500;
const PEAK_GAIN = 0.95;
const FLOOR_GAIN = 0.001;

export const APP_SIGNAL_PATTERNS: Record<SignalTone, SignalPattern> = {
  kds: {
    frequencies: [740, 880, 988],
    pulses: 2,
    pulseGapSeconds: 0.18,
    pulseDurationSeconds: 0.42,
    oscillatorType: "square",
  },
  "kds-new": {
    frequencies: [740, 880, 988],
    pulses: 2,
    pulseGapSeconds: 0.18,
    pulseDurationSeconds: 0.42,
    oscillatorType: "square",
  },
  "kds-append": {
    frequencies: [587, 740, 587],
    pulses: 3,
    pulseGapSeconds: 0.1,
    pulseDurationSeconds: 0.22,
    oscillatorType: "square",
  },
  "kds-add-on": {
    frequencies: [1175, 988, 1318],
    pulses: 2,
    pulseGapSeconds: 0.08,
    pulseDurationSeconds: 0.28,
    oscillatorType: "square",
  },
  pos: {
    frequencies: [660, 880, 1046],
    pulses: 2,
    pulseGapSeconds: 0.18,
    pulseDurationSeconds: 0.42,
    oscillatorType: "square",
  },
};

function getSignalDurationMs(pattern: SignalPattern): number {
  const totalSeconds =
    pattern.pulses * pattern.pulseDurationSeconds +
    Math.max(0, pattern.pulses - 1) * pattern.pulseGapSeconds;
  return totalSeconds * 1_000;
}

function schedulePulse(
  context: AudioContext,
  destination: AudioNode,
  startAt: number,
  pattern: SignalPattern,
) {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(destination);

  const [startFreq, midFreq, endFreq] = pattern.frequencies;
  const peakAt = startAt + Math.min(0.025, pattern.pulseDurationSeconds / 4);
  const holdUntil =
    startAt + Math.max(0.04, pattern.pulseDurationSeconds - 0.1);
  const endAt = startAt + pattern.pulseDurationSeconds;
  oscillator.type = pattern.oscillatorType;
  oscillator.frequency.setValueAtTime(startFreq, startAt);
  oscillator.frequency.setValueAtTime(
    midFreq,
    startAt + pattern.pulseDurationSeconds * 0.35,
  );
  oscillator.frequency.setValueAtTime(
    endFreq,
    startAt + pattern.pulseDurationSeconds * 0.7,
  );
  gainNode.gain.setValueAtTime(FLOOR_GAIN, startAt);
  gainNode.gain.exponentialRampToValueAtTime(PEAK_GAIN, peakAt);
  gainNode.gain.setValueAtTime(PEAK_GAIN, holdUntil);
  gainNode.gain.exponentialRampToValueAtTime(FLOOR_GAIN, endAt);

  oscillator.start(startAt);
  oscillator.stop(endAt);
}

export function playAppSignal(tone: SignalTone, force = false): void {
  const now = Date.now();
  const lastSignalAt = lastSignalAtByTone[tone] ?? 0;
  if (!force && now - lastSignalAt < MIN_SIGNAL_INTERVAL_MS) return;
  lastSignalAtByTone = { ...lastSignalAtByTone, [tone]: now };

  try {
    const audioWindow = window as AudioWindow;
    const AudioContextCtor: AudioContextConstructor | undefined =
      audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextCtor) return;
    if (!audioCtx) {
      audioCtx = new AudioContextCtor();
    }
    if (audioCtx.state === "suspended") {
      void audioCtx.resume();
    }

    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, audioCtx.currentTime);
    compressor.knee.setValueAtTime(6, audioCtx.currentTime);
    compressor.ratio.setValueAtTime(4, audioCtx.currentTime);
    compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
    compressor.release.setValueAtTime(0.12, audioCtx.currentTime);
    compressor.connect(audioCtx.destination);

    const startAt = audioCtx.currentTime;
    const pattern = APP_SIGNAL_PATTERNS[tone];
    for (let index = 0; index < pattern.pulses; index += 1) {
      schedulePulse(
        audioCtx,
        compressor,
        startAt +
          index * (pattern.pulseDurationSeconds + pattern.pulseGapSeconds),
        pattern,
      );
    }
    window.setTimeout(
      () => {
        compressor.disconnect();
      },
      getSignalDurationMs(pattern) + 100,
    );
  } catch {
    // Audio not available or blocked by the browser.
  }
}
