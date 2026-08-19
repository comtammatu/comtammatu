import { playAlertAudioBuffer } from "./audio-signal";
import { listPrefetchUtterances } from "./operational-audio-catalog";

const TTS_CACHE_NAME = "ctmt-operational-tts-v1";
const TTS_FETCH_TIMEOUT_MS = 1_800;
const PREFETCH_NETWORK_GAP_MS = 2_000;
const PREFETCH_FETCH_TIMEOUT_MS = 8_000;
const RATE_LIMITED_FALLBACK_WAIT_MS = 15_000;
const SPEAK_PATH = "/api/operational-audio/speak";
const RECEIVED_AMOUNT_PREFIX = "Đã nhận ";
const AMOUNT_MEMORY_LIMIT = 80;
const AMOUNT_CACHE_LIMIT = 80;

let cloudTtsAvailable: boolean | null = null;
let speakGeneration = 0;
let pendingClipAbort: AbortController | null = null;
let stopCurrentClip: (() => void) | null = null;

const catalogClips = new Map<string, ArrayBuffer>();
const amountClips = new Map<string, ArrayBuffer>();

function isCloudTtsUnavailable(): boolean {
  return cloudTtsAvailable === false;
}

function isAmountUtterance(text: string): boolean {
  return text.startsWith(RECEIVED_AMOUNT_PREFIX);
}

export function cancelOperationalVoice(): void {
  speakGeneration += 1;
  pendingClipAbort?.abort();
  pendingClipAbort = null;
  stopCurrentClip?.();
  stopCurrentClip = null;
  window.speechSynthesis?.cancel();
}

function clipRequest(text: string): Request {
  const url = `${SPEAK_PATH}?text=${encodeURIComponent(text)}`;
  return new Request(url, {
    method: "GET",
    credentials: "include",
  });
}

function readMemoryClip(text: string): ArrayBuffer | undefined {
  if (isAmountUtterance(text)) {
    const hit = amountClips.get(text);
    if (!hit) return undefined;
    amountClips.delete(text);
    amountClips.set(text, hit);
    return hit;
  }
  return catalogClips.get(text);
}

function rememberMemoryClip(text: string, buffer: ArrayBuffer): void {
  if (isAmountUtterance(text)) {
    amountClips.delete(text);
    while (amountClips.size >= AMOUNT_MEMORY_LIMIT) {
      const oldest = amountClips.keys().next().value;
      if (typeof oldest !== "string") break;
      amountClips.delete(oldest);
    }
    amountClips.set(text, buffer);
    return;
  }
  catalogClips.set(text, buffer);
}

async function trimAmountCache(cache: Cache): Promise<void> {
  const requests = await cache.keys();
  const amountRequests = requests.filter((request) => {
    try {
      const spoken = new URL(request.url).searchParams.get("text") ?? "";
      return spoken.startsWith(RECEIVED_AMOUNT_PREFIX);
    } catch {
      return false;
    }
  });
  const extra = amountRequests.length - AMOUNT_CACHE_LIMIT;
  if (extra <= 0) return;
  for (const request of amountRequests.slice(0, extra)) {
    await cache.delete(request);
  }
}

async function readCachedClip(text: string): Promise<ArrayBuffer | null> {
  const memory = readMemoryClip(text);
  if (memory) return memory;
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(TTS_CACHE_NAME);
    const hit = await cache.match(clipRequest(text));
    if (!hit || !hit.ok) return null;
    const buffer = await hit.arrayBuffer();
    rememberMemoryClip(text, buffer);
    return buffer;
  } catch {
    return null;
  }
}

async function storeClip(text: string, buffer: ArrayBuffer): Promise<void> {
  rememberMemoryClip(text, buffer);
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(TTS_CACHE_NAME);
    await cache.put(
      clipRequest(text),
      new Response(buffer.slice(0), {
        headers: { "Content-Type": "audio/mpeg" },
      }),
    );
    if (isAmountUtterance(text)) await trimAmountCache(cache);
  } catch {
    // Cache Storage can be missing in private mode; memory still works.
  }
}

async function fetchCloudClip(
  text: string,
  signal: AbortSignal,
): Promise<ArrayBuffer | null | "rate_limited"> {
  if (cloudTtsAvailable === false) return null;
  const cached = await readCachedClip(text);
  if (cached) {
    cloudTtsAvailable = true;
    return cached;
  }

  try {
    const response = await fetch(clipRequest(text), { signal });
    if (response.status === 429) return "rate_limited";
    if (response.status === 503) {
      let code = "";
      try {
        const body = (await response.json()) as { error?: unknown };
        code = typeof body.error === "string" ? body.error : "";
      } catch {
        code = "";
      }
      // Unconfigured stays latched; transient gateway failures may recover.
      if (code === "tts_unconfigured") cloudTtsAvailable = false;
      return null;
    }
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) return null;
    cloudTtsAvailable = true;
    await storeClip(text, buffer);
    return buffer;
  } catch {
    return null;
  }
}

function pickVietnameseVoice(
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  const vietnamese = voices.filter((voice) =>
    voice.lang.toLowerCase().startsWith("vi"),
  );
  return (
    vietnamese.find((voice) =>
      /neural|google|microsoft|hoai|minh|linh/i.test(voice.name),
    ) ??
    vietnamese.find((voice) => voice.lang.toLowerCase() === "vi-vn") ??
    vietnamese[0]
  );
}

function speakBrowser(text: string): void {
  const synth = window.speechSynthesis as SpeechSynthesis | undefined;
  if (!synth) return;

  const vietnamese = pickVietnameseVoice(synth.getVoices());
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "vi-VN";
  utterance.rate = 0.95;
  utterance.pitch = 1;
  utterance.volume = 1;
  if (vietnamese) utterance.voice = vietnamese;
  synth.cancel();
  synth.speak(utterance);
}

async function playPrimedVoice(
  text: string,
  clipPromise: Promise<ArrayBuffer | null | "rate_limited">,
  generation: number,
): Promise<void> {
  const clip = await clipPromise.catch(() => null);
  if (generation !== speakGeneration) return;
  if (clip && clip !== "rate_limited") {
    const playback = playAlertAudioBuffer(clip);
    stopCurrentClip = playback.stop;
    await playback.stopped;
    if (generation === speakGeneration) stopCurrentClip = null;
    return;
  }
  speakBrowser(text);
}

export function primeOperationalVoice(text: string): { play: () => void } {
  const generation = ++speakGeneration;
  pendingClipAbort?.abort();
  stopCurrentClip?.();
  stopCurrentClip = null;
  window.speechSynthesis?.cancel();

  const abort = new AbortController();
  pendingClipAbort = abort;
  const timeout = window.setTimeout(() => {
    abort.abort();
  }, TTS_FETCH_TIMEOUT_MS);
  const clipPromise = fetchCloudClip(text, abort.signal).finally(() => {
    window.clearTimeout(timeout);
  });

  return {
    play() {
      if (generation !== speakGeneration) return;
      void playPrimedVoice(text, clipPromise, generation);
    },
  };
}

export function prefetchOperationalVoiceCatalog(options?: {
  tableLabels?: readonly string[] | undefined;
  surface?: "pos" | "kds" | undefined;
}): void {
  if (isCloudTtsUnavailable()) return;
  const queue = [...listPrefetchUtterances(options)];
  void (async () => {
    let rateLimitedStreak = 0;
    while (queue.length > 0) {
      if (isCloudTtsUnavailable()) return;
      const text = queue.shift();
      if (!text || readMemoryClip(text)) continue;
      const startedAt = Date.now();
      const result = await fetchCloudClip(
        text,
        AbortSignal.timeout(PREFETCH_FETCH_TIMEOUT_MS),
      );
      if (result === "rate_limited") {
        rateLimitedStreak += 1;
        if (rateLimitedStreak > 3) return;
        queue.unshift(text);
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, RATE_LIMITED_FALLBACK_WAIT_MS);
        });
        continue;
      }
      rateLimitedStreak = 0;
      const waitMs = PREFETCH_NETWORK_GAP_MS - (Date.now() - startedAt);
      if (waitMs > 0) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, waitMs);
        });
      }
    }
  })();
}
