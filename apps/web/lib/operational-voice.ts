import { playAlertAudioBuffer } from "./audio-signal";
import { listPrefetchUtterances } from "./operational-audio-catalog";

const TTS_CACHE_NAME = "ctmt-operational-tts-v1";
const TTS_FETCH_TIMEOUT_MS = 2_500;
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
}

function clipRequest(text: string, live = false): Request {
  const params = new URLSearchParams({ text });
  if (live) params.set("live", "1");
  return new Request(`${SPEAK_PATH}?${params.toString()}`, {
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
    const response = await fetch(clipRequest(text, true), { signal });
    if (response.status === 429) return "rate_limited";
    if (response.status === 503) {
      let code = "";
      try {
        const body = (await response.json()) as { error?: unknown };
        code = typeof body.error === "string" ? body.error : "";
      } catch {
        code = "";
      }
      // Unconfigured stays latched. Other 503s are treated as rate-limit so
      // prefetch stops instead of retrying every 2s against a hot Gateway.
      if (code === "tts_unconfigured") {
        cloudTtsAvailable = false;
        return null;
      }
      return "rate_limited";
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

async function playPrimedVoice(
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
  }
}

export function primeOperationalVoice(text: string): { play: () => void } {
  const generation = ++speakGeneration;
  pendingClipAbort?.abort();
  stopCurrentClip?.();
  stopCurrentClip = null;

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
      void playPrimedVoice(clipPromise, generation);
    },
  };
}

let prefetchGeneration = 0;

export function prefetchOperationalVoiceCatalog(options?: {
  tableLabels?: readonly string[] | undefined;
  surface?: "pos" | "kds" | undefined;
}): void {
  if (isCloudTtsUnavailable()) return;
  const generation = ++prefetchGeneration;
  void (async () => {
    for (const text of listPrefetchUtterances(options)) {
      if (generation !== prefetchGeneration) return;
      if (isCloudTtsUnavailable()) return;
      if (!text || readMemoryClip(text)) continue;
      await readCachedClip(text);
    }
  })();
}
