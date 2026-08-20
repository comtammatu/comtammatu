import "server-only";
import { generateSpeech } from "ai";
import { GatewayError, gateway } from "@ai-sdk/gateway";

// Locked cost choice: cheapest OpenAI speech model on Gateway. Not env-switched.
const TTS_MODEL = "openai/tts-1";
const TTS_VOICE = "nova";
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

export function getCachedOperationalUtterance(text: string): Buffer | null {
  return clipCache.get(text) ?? null;
}

export function isOperationalTtsConfigured(): boolean {
  // On Vercel the SDK authenticates with OIDC even when the Sensitive key is
  // not visible to this module. Locally, require an explicit Gateway key.
  return (
    getOperationalTtsToken() !== null || readRuntimeSecret("VERCEL") === "1"
  );
}

function isAmountUtterance(text: string): boolean {
  return text.startsWith(RECEIVED_AMOUNT_PREFIX);
}

function rememberClip(text: string, bytes: Buffer): void {
  clipCache.delete(text);
  const amount = isAmountUtterance(text);
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
  clipCache.set(text, bytes);
}

export async function synthesizeOperationalUtterance(
  text: string,
): Promise<Buffer | null | "rate_limited"> {
  const cached = clipCache.get(text);
  if (cached) return cached;
  if (Date.now() < gatewayCoolDownUntil) return "rate_limited";

  if (!isOperationalTtsConfigured()) return null;

  try {
    const result = await generateSpeech({
      model: gateway.speechModel(TTS_MODEL),
      text,
      voice: TTS_VOICE,
      outputFormat: "mp3",
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });
    const bytes = Buffer.from(result.audio.uint8Array);
    if (bytes.byteLength === 0) return null;
    rememberClip(text, bytes);
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
