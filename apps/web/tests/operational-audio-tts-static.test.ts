import { readSql } from "./_lib/active-sql.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");
const read = (path: string) =>
  String(path).includes("supabase/migrations/")
    ? readSql(root, String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(join(root, path), "utf8");

test("operational cloud TTS stays allowlisted, authenticated, and cloud-only", () => {
  const route = read("app/api/operational-audio/speak/route.ts");
  const voice = read("lib/operational-voice.ts");
  const audio = read("lib/operational-audio.ts");
  const gateway = read("lib/operational-tts-gateway.ts");
  const config = read("lib/operational-tts-config.ts");
  const sharedTts = read("../../packages/shared/src/settings/tts.ts");
  const branchAudioForm = read(
    "app/(protected)/br/[branchId]/(operator)/settings/audio/audio-form.tsx",
  );
  const tenantAudioForm = read(
    "app/(protected)/settings/(tenant)/audio/audio-form.tsx",
  );
  const provider = read(
    "app/(protected)/br/[branchId]/pos/_providers/pos-desktop-provider.tsx",
  );
  const sync = read(
    "app/(protected)/br/[branchId]/pos/_hooks/use-order-sync.ts",
  );

  assert.match(route, /isAllowedOperationalUtterance/);
  assert.match(route, /PERMISSION_KEYS\.POS_USE/);
  assert.match(route, /PERMISSION_KEYS\.KDS_USE/);
  assert.match(route, /tts_unconfigured/);
  assert.match(route, /ttsRateLimit\.limit\("operational"\)/);
  assert.match(route, /bytes === "rate_limited"/);
  assert.match(route, /get\("live"\) === "1"/);
  assert.match(route, /getCachedOperationalUtterance/);
  assert.match(route, /resolveTtsConfig/);
  assert.match(route, /branchId/);
  assert.doesNotMatch(route, /openai\.com/);

  assert.match(sharedTts, /ALLOWED_TTS_MODELS/);
  assert.match(sharedTts, /openai\/tts-1/);
  assert.match(sharedTts, /fish-audio\/s2\.1-pro/);
  assert.doesNotMatch(sharedTts, /tts-1-hd/);
  assert.match(sharedTts, /isAllowedTtsModel/);
  assert.match(sharedTts, /DEFAULT_TTS_MODEL/);
  assert.match(sharedTts, /DEFAULT_TTS_VOICE = "onyx"/);
  assert.match(branchAudioForm, /DEFAULT_TTS_VOICE/);
  assert.match(tenantAudioForm, /DEFAULT_TTS_VOICE/);
  assert.doesNotMatch(branchAudioForm, /setVoice\("nova"\)/);
  assert.doesNotMatch(tenantAudioForm, /setVoice\("nova"\)/);

  assert.match(config, /resolveTtsConfig/);
  assert.match(config, /resolveTtsConfigFromRows/);
  assert.match(config, /branch_settings/);
  assert.match(config, /system_settings/);

  assert.match(gateway, /from "ai"/);
  assert.match(gateway, /from "@ai-sdk\/gateway"/);
  assert.match(gateway, /generateSpeech/);
  assert.match(gateway, /GatewayError/);
  assert.match(gateway, /gatewayCoolDownByModel/);
  assert.match(gateway, /"rate_limited"/);
  assert.match(gateway, /gateway\.speechModel\(effectiveConfig\.model\)/);
  assert.match(gateway, /outputFormat: "mp3"/);
  assert.doesNotMatch(gateway, /language:/);
  assert.doesNotMatch(gateway, /instructions:/);
  assert.doesNotMatch(gateway, /ai-gateway\.vercel\.sh/);
  assert.doesNotMatch(gateway, /tts-1-hd/);
  assert.match(gateway, /server-only/);
  assert.match(gateway, /globalThis\.process\?\.env/);
  assert.match(gateway, /readRuntimeSecret\("AI_GATEWAY_API_KEY"\)/);
  assert.match(gateway, /readRuntimeSecret\("VERCEL_OIDC_TOKEN"\)/);
  assert.match(gateway, /readRuntimeSecret\("VERCEL"\) === "1"/);
  assert.doesNotMatch(gateway, /process\.env\.AI_GATEWAY_API_KEY/);
  assert.doesNotMatch(gateway, /process\.env\["AI_GATEWAY_API_KEY"\]/);

  const signal = read("lib/audio-signal.ts");
  assert.match(signal, /VOICE_PLAYBACK_GAIN = 3;/);
  assert.match(signal, /VOICE_PLAYBACK_RATE = 1;/);
  assert.match(signal, /VOICE_NORMALIZE_PEAK = 0\.95;/);
  assert.match(signal, /VOICE_HIGHPASS_HZ = 160;/);
  assert.match(signal, /VOICE_PRESENCE_HZ = 3000;/);
  assert.match(signal, /VOICE_PRESENCE_GAIN_DB = 8;/);
  assert.match(signal, /voiceNormalizeScale/);
  assert.match(signal, /createBiquadFilter/);
  assert.match(signal, /type = "highpass"/);
  assert.match(signal, /type = "peaking"/);
  assert.match(signal, /connectAlertCompressor\(context\);/);
  assert.match(signal, /connectVoiceLimiter\(context\);/);
  assert.doesNotMatch(
    signal,
    /playAlertAudioBuffer[\s\S]*connectAlertCompressor/,
  );

  assert.match(voice, /primeOperationalVoice/);
  assert.match(voice, /prefetchOperationalVoiceCatalog/);
  assert.match(voice, /code === "tts_unconfigured"/);
  assert.match(voice, /TTS_FETCH_TIMEOUT_MS = 10_000/);
  assert.match(gateway, /const TTS_TIMEOUT_MS = 8_000/);
  assert.match(route, /maxDuration = 15/);
  assert.doesNotMatch(route, /export const dynamic/);
  assert.match(voice, /params\.set\("live", "1"\)/);
  assert.match(voice, /clipRequest\(text, true, branchId\)/);
  assert.match(voice, /prefetchGeneration/);
  assert.doesNotMatch(voice, /PREFETCH_NETWORK_GAP_MS/);
  assert.doesNotMatch(voice, /PREFETCH_FETCH_TIMEOUT_MS/);
  assert.doesNotMatch(voice, /speechSynthesis/);
  assert.doesNotMatch(voice, /speakBrowser/);
  assert.match(voice, /"rate_limited"/);
  assert.doesNotMatch(
    voice,
    /if \(response\.status === 503\) \{\s*cloudTtsAvailable = false;/,
  );
  assert.match(audio, /primeOperationalVoice\(text, branchId\)/);
  assert.match(audio, /prefetchOperationalVoiceCatalog\(/);
  assert.match(provider, /tableVoiceLabels/);
  assert.match(sync, /shouldAnnouncePaymentReceived/);
  assert.match(sync, /amountVnd:/);
  assert.match(sync, /Bếp hoàn thành/);
  assert.doesNotMatch(sync, /playAppSignal/);
});
