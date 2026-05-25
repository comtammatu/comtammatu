"use client";

type SignalTone = "kds" | "pos";
type AudioContextConstructor = new () => AudioContext;
type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
  };

let audioCtx: AudioContext | null = null;
let lastSignalAtByTone: Partial<Record<SignalTone, number>> = {};

const MIN_SIGNAL_INTERVAL_MS = 2_500;
const PEAK_GAIN = 0.95;
const FLOOR_GAIN = 0.001;
const PULSE_GAP_SECONDS = 0.18;
const PULSE_DURATION_SECONDS = 0.42;

const SIGNAL_FREQUENCIES: Record<SignalTone, [number, number, number]> = {
  kds: [740, 880, 988],
  pos: [660, 880, 1046],
};

function schedulePulse(
  context: AudioContext,
  destination: AudioNode,
  startAt: number,
  frequencies: [number, number, number],
) {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(destination);

  const [startFreq, midFreq, endFreq] = frequencies;
  const peakAt = startAt + 0.025;
  const holdUntil = startAt + PULSE_DURATION_SECONDS - 0.1;
  const endAt = startAt + PULSE_DURATION_SECONDS;
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(startFreq, startAt);
  oscillator.frequency.setValueAtTime(midFreq, startAt + 0.1);
  oscillator.frequency.setValueAtTime(endFreq, startAt + 0.24);
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
    const frequencies = SIGNAL_FREQUENCIES[tone];
    schedulePulse(audioCtx, compressor, startAt, frequencies);
    schedulePulse(
      audioCtx,
      compressor,
      startAt + PULSE_DURATION_SECONDS + PULSE_GAP_SECONDS,
      frequencies,
    );
    window.setTimeout(() => {
      compressor.disconnect();
    }, (PULSE_DURATION_SECONDS * 2 + PULSE_GAP_SECONDS) * 1_000 + 100);
  } catch {
    // Audio not available or blocked by the browser.
  }
}
