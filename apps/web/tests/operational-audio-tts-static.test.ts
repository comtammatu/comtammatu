import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("operational cloud TTS stays allowlisted, authenticated, and fail-open", () => {
  const route = read("app/api/operational-audio/speak/route.ts");
  const voice = read("lib/operational-voice.ts");
  const audio = read("lib/operational-audio.ts");
  const gateway = read("lib/operational-tts-gateway.ts");
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
  assert.match(route, /rateLimit\.limit/);
  assert.doesNotMatch(route, /openai\.com/);

  assert.match(gateway, /ai-gateway\.vercel\.sh\/v4\/ai\/speech-model/);
  assert.match(gateway, /const TTS_MODEL = "openai\/tts-1"/);
  assert.doesNotMatch(gateway, /tts-1-hd/);
  assert.doesNotMatch(gateway, /OPERATIONAL_TTS_MODEL/);
  assert.match(gateway, /server-only/);
  assert.match(gateway, /AI_GATEWAY_API_KEY/);

  assert.match(voice, /primeOperationalVoice/);
  assert.match(voice, /prefetchOperationalVoiceCatalog/);
  assert.match(audio, /primeOperationalVoice\(text\)/);
  assert.match(audio, /prefetchOperationalVoiceCatalog\(/);
  assert.match(provider, /tableLabels: tables.map/);
  assert.match(sync, /amountVnd:/);
});
