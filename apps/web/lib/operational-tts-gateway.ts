import "server-only";
import { generateSpeech } from "ai";
import { GatewayError, gateway } from "@ai-sdk/gateway";
import {
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  type ResolvedTtsConfig,
} from "@comtammatu/shared/settings";

const TTS_TIMEOUT_MS = 8_000;
const MAX_CATALOG_CLIPS = 200;
const MAX_AMOUNT_CLIPS = 80;
const RECEIVED_AMOUNT_PREFIX = "Đã nhận ";
const GATEWAY_COOLDOWN_MS = 60_000;

const clipCache = new Map<string, Buffer>();
let gatewayCoolDownUntil = 0;

function readRuntimeSecret(name: string): string | null {
  // Dynamic lookup: Next inlines `process.env.NAME` (and often literal
  // bracket access) at build. Vercel Sensitive env exists only at runtime.
  const value = globalThis.process?.env?.[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getOperationalTtsToken(): string | null {
  return (
    readRuntimeSecret("AI_GATEWAY_API_KEY") ??
    readRuntimeSecret("VERCEL_OIDC_TOKEN")
  );
}

export function buildClipCacheKey(
  text: string,
  cfg?: ResolvedTtsConfig,
): string {
  const model = cfg?.model ?? DEFAULT_TTS_MODEL;
  const voice =
    cfg?.voice ?? (model === DEFAULT_TTS_MODEL ? DEFAULT_TTS_VOICE : "");
  return `${model}\0${voice}\0${text}`;
}

export function getCachedOperationalUtterance(
  text: string,
  cfg?: ResolvedTtsConfig,
): Buffer | null {
  const key = buildClipCacheKey(text, cfg);
  return clipCache.get(key) ?? null;
}

export function isOperationalTtsConfigured(): boolean {
  // On Vercel the SDK authenticates with OIDC even when the Sensitive key is
  // not visible to this module. Locally, require an explicit Gateway key.
  return (
    getOperationalTtsToken() !== null || readRuntimeSecret("VERCEL") === "1"
  );
}

function isAmountUtterance(keyOrText: string): boolean {
  const text = keyOrText.includes("\0")
    ? (keyOrText.split("\0").at(-1) ?? "")
    : keyOrText;
  return text.startsWith(RECEIVED_AMOUNT_PREFIX);
}

function rememberClip(cacheKey: string, bytes: Buffer): void {
  clipCache.delete(cacheKey);
  const amount = isAmountUtterance(cacheKey);
  const limit = amount ? MAX_AMOUNT_CLIPS : MAX_CATALOG_CLIPS;
  let matching = 0;
  for (const key of clipCache.keys()) {
    if (isAmountUtterance(key) === amount) matching += 1;
  }
  if (matching >= limit) {
    for (const key of clipCache.keys()) {
      if (isAmountUtterance(key) === amount) {
        clipCache.delete(key);
        break;
      }
    }
  }
  clipCache.set(cacheKey, bytes);
}

export async function synthesizeOperationalUtterance(
  text: string,
  cfg?: ResolvedTtsConfig,
): Promise<Buffer | null | "rate_limited"> {
  const effectiveConfig: ResolvedTtsConfig = cfg ?? {
    model: DEFAULT_TTS_MODEL,
    voice: DEFAULT_TTS_VOICE,
  };
  const cacheKey = buildClipCacheKey(text, effectiveConfig);
  const cached = clipCache.get(cacheKey);
  if (cached) return cached;
  if (Date.now() < gatewayCoolDownUntil) return "rate_limited";

  if (!isOperationalTtsConfigured()) return null;

  try {
    const result = await generateSpeech({
      model: gateway.speechModel(effectiveConfig.model),
      text,
      ...(effectiveConfig.voice ? { voice: effectiveConfig.voice } : {}),
      outputFormat: "mp3",
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });
    const bytes = Buffer.from(result.audio.uint8Array);
    if (bytes.byteLength === 0) return null;
    rememberClip(cacheKey, bytes);
    return bytes;
  } catch (error) {
    console.warn(
      "[operational-tts] gateway failed=%s",
      error instanceof Error
        ? `${error.name}:${error.message.slice(0, 80)}`
        : "unknown",
    );
    if (GatewayError.isInstance(error)) {
      gatewayCoolDownUntil = Date.now() + GATEWAY_COOLDOWN_MS;
      return "rate_limited";
    }
    return null;
  }
}
