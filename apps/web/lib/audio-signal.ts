"use client";

export type SignalTone =
  | "kds"
  | "kds-new"
  | "kds-append"
  | "kds-add-on"
  | "pos"
  | "pos-self-order"
  | "pos-payment-call"
  | "pos-staff-call"
  | "pos-payment-received";
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
  // POS baseline (print / OOS): short falling pair.
  // KDS new-ticket stays a long rising square; do not reuse that contour.
  pos: {
    frequencies: [784, 659, 523],
    pulses: 2,
    pulseGapSeconds: 0.2,
    pulseDurationSeconds: 0.16,
    oscillatorType: "square",
  },
  // QR self-order pending approval: rising triplet, not a kitchen ticket.
  "pos-self-order": {
    frequencies: [659, 784, 988],
    pulses: 3,
    pulseGapSeconds: 0.09,
    pulseDurationSeconds: 0.2,
    oscillatorType: "square",
  },
  // Guest payment call (cash / VietQR): insistent high alternating ding.
  "pos-payment-call": {
    frequencies: [1397, 1046, 1397],
    pulses: 4,
    pulseGapSeconds: 0.07,
    pulseDurationSeconds: 0.16,
    oscillatorType: "square",
  },
  // Guest staff call: low pager pair, not the payment-call rhythm.
  "pos-staff-call": {
    frequencies: [392, 494, 392],
    pulses: 2,
    pulseGapSeconds: 0.28,
    pulseDurationSeconds: 0.32,
    oscillatorType: "square",
  },
  // Confirmed table payment: descending pair, not the POS/KDS baseline ping.
  "pos-payment-received": {
    frequencies: [988, 784, 523],
    pulses: 2,
    pulseGapSeconds: 0.14,
    pulseDurationSeconds: 0.22,
    oscillatorType: "square",
  },
};

function getSignalDurationMs(pattern: SignalPattern): number {
  const totalSeconds =
    pattern.pulses * pattern.pulseDurationSeconds +
    Math.max(0, pattern.pulses - 1) * pattern.pulseGapSeconds;
  return totalSeconds * 1_000;
}

export function getAppSignalDurationMs(tone: SignalTone): number {
  return Math.round(getSignalDurationMs(APP_SIGNAL_PATTERNS[tone]));
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

function getAudioContext(): AudioContext | null {
  const audioWindow = window as AudioWindow;
  const AudioContextCtor: AudioContextConstructor | undefined =
    audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!audioCtx) {
    audioCtx = new AudioContextCtor();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

function connectAlertCompressor(context: AudioContext): DynamicsCompressorNode {
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-18, context.currentTime);
  compressor.knee.setValueAtTime(6, context.currentTime);
  compressor.ratio.setValueAtTime(4, context.currentTime);
  compressor.attack.setValueAtTime(0.003, context.currentTime);
  compressor.release.setValueAtTime(0.12, context.currentTime);
  compressor.connect(context.destination);
  return compressor;
}

/** Catch peaks after voice gain; the beep compressor at -18 dB ate prior boosts. */
function connectVoiceLimiter(context: AudioContext): DynamicsCompressorNode {
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-3, context.currentTime);
  limiter.knee.setValueAtTime(2, context.currentTime);
  limiter.ratio.setValueAtTime(20, context.currentTime);
  limiter.attack.setValueAtTime(0.002, context.currentTime);
  limiter.release.setValueAtTime(0.08, context.currentTime);
  limiter.connect(context.destination);
  return limiter;
}

export function playAppSignal(tone: SignalTone, force = false): void {
  const now = Date.now();
  const lastSignalAt = lastSignalAtByTone[tone] ?? 0;
  if (!force && now - lastSignalAt < MIN_SIGNAL_INTERVAL_MS) return;
  lastSignalAtByTone = { ...lastSignalAtByTone, [tone]: now };

  try {
    const context = getAudioContext();
    if (!context) return;
    const compressor = connectAlertCompressor(context);
    const startAt = context.currentTime;
    const pattern = APP_SIGNAL_PATTERNS[tone];
    for (let index = 0; index < pattern.pulses; index += 1) {
      schedulePulse(
        context,
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

/** nova MP3 stays well below square beeps; boost then peak-limit. */
export const VOICE_PLAYBACK_GAIN = 6;
/** Recorded nova speed. Do not pitch-shift clips with playbackRate. */
export const VOICE_PLAYBACK_RATE = 1;

export function playAlertAudioBuffer(buffer: ArrayBuffer): {
  stopped: Promise<void>;
  stop: () => void;
} {
  const context = getAudioContext();
  if (!context) {
    return { stopped: Promise.resolve(), stop() {} };
  }

  let source: AudioBufferSourceNode | null = null;
  let limiter: DynamicsCompressorNode | null = null;
  let stopped = false;

  const stoppedPromise = context.decodeAudioData(buffer.slice(0)).then(
    (audioBuffer) =>
      new Promise<void>((resolve) => {
        if (stopped) {
          resolve();
          return;
        }
        limiter = connectVoiceLimiter(context);
        const gainNode = context.createGain();
        gainNode.gain.setValueAtTime(VOICE_PLAYBACK_GAIN, context.currentTime);
        source = context.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = VOICE_PLAYBACK_RATE;
        source.connect(gainNode);
        gainNode.connect(limiter);
        source.onended = () => {
          limiter?.disconnect();
          resolve();
        };
        source.start(context.currentTime);
      }),
    () => undefined,
  );

  return {
    stopped: stoppedPromise,
    stop() {
      stopped = true;
      try {
        source?.stop();
      } catch {
        // Already stopped.
      }
      limiter?.disconnect();
    },
  };
}
