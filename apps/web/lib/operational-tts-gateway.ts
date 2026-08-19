import "server-only";

const GATEWAY_SPEECH_URL = "https://ai-gateway.vercel.sh/v4/ai/speech-model";
// Locked cost choice: cheapest OpenAI speech model on Gateway. Not env-switched.
const TTS_MODEL = "openai/tts-1";
const TTS_TIMEOUT_MS = 2_500;
const MAX_CATALOG_CLIPS = 200;
const MAX_AMOUNT_CLIPS = 80;
const RECEIVED_AMOUNT_PREFIX = "Đã nhận ";

const clipCache = new Map<string, Buffer>();

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
  return getOperationalTtsToken() !== null;
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
): Promise<Buffer | null> {
  const cached = clipCache.get(text);
  if (cached) return cached;

  const token = getOperationalTtsToken();
  if (!token) return null;

  const response = await fetch(GATEWAY_SPEECH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "ai-model-id": TTS_MODEL,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice: readRuntimeSecret("OPERATIONAL_TTS_VOICE") || "nova",
      outputFormat: "mp3",
      speed: 1,
      language: "vi",
      instructions:
        "Speak Vietnamese clearly as a short restaurant floor alert. Firm, no pause, no extra words.",
    }),
    signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
  });
  if (!response.ok) {
    console.error(
      "[operational-tts] gateway status=%s",
      String(response.status),
    );
    return null;
  }

  const payload = (await response.json()) as { audio?: unknown };
  if (typeof payload.audio !== "string" || payload.audio.length === 0) {
    return null;
  }
  const bytes = Buffer.from(payload.audio, "base64");
  if (bytes.byteLength === 0) return null;
  rememberClip(text, bytes);
  return bytes;
}
