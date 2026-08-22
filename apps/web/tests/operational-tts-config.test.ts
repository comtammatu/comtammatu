import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALLOWED_TTS_MODELS,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  isAllowedTtsModel,
  resolveTtsConfigFromRows,
  SYSTEM_SETTING_KEYS,
} from "@comtammatu/shared/settings";

test("allowlist validation", () => {
  assert.equal(ALLOWED_TTS_MODELS.includes("openai/tts-1"), true);
  assert.equal(ALLOWED_TTS_MODELS.includes("fish-audio/s2.1-pro"), true);
  assert.equal(isAllowedTtsModel("openai/tts-1"), true);
  assert.equal(isAllowedTtsModel("fish-audio/s2.1-pro"), true);
  assert.equal(isAllowedTtsModel("openai/tts-1-hd"), false);
  assert.equal(isAllowedTtsModel("elevenlabs/multilingual"), false);
  assert.equal(isAllowedTtsModel(null), false);
  assert.equal(isAllowedTtsModel(undefined), false);
  assert.equal(isAllowedTtsModel(123), false);
});

test("resolveTtsConfigFromRows falls back to default when no rows exist", () => {
  const cfg = resolveTtsConfigFromRows({});
  assert.equal(cfg.model, DEFAULT_TTS_MODEL);
  assert.equal(cfg.voice, DEFAULT_TTS_VOICE);
});

test("resolveTtsConfigFromRows reads tenant default when branch has no override", () => {
  const cfg = resolveTtsConfigFromRows({
    tenantRows: [
      { key: SYSTEM_SETTING_KEYS.TTS_MODEL, value: "fish-audio/s2.1-pro" },
      { key: SYSTEM_SETTING_KEYS.TTS_VOICE, value: "custom-fish-voice-id" },
    ],
  });
  assert.equal(cfg.model, "fish-audio/s2.1-pro");
  assert.equal(cfg.voice, "custom-fish-voice-id");
});

test("resolveTtsConfigFromRows branch override takes precedence over tenant", () => {
  const cfg = resolveTtsConfigFromRows({
    tenantRows: [
      { key: SYSTEM_SETTING_KEYS.TTS_MODEL, value: "fish-audio/s2.1-pro" },
      { key: SYSTEM_SETTING_KEYS.TTS_VOICE, value: "custom-fish-voice-id" },
    ],
    branchRows: [
      { key: SYSTEM_SETTING_KEYS.TTS_MODEL, value: "openai/tts-1" },
      { key: SYSTEM_SETTING_KEYS.TTS_VOICE, value: "alloy" },
    ],
  });
  assert.equal(cfg.model, "openai/tts-1");
  assert.equal(cfg.voice, "alloy");
});

test("resolveTtsConfigFromRows rejects invalid models and falls back to openai/tts-1", () => {
  const cfg = resolveTtsConfigFromRows({
    tenantRows: [
      { key: SYSTEM_SETTING_KEYS.TTS_MODEL, value: "unsupported-model" },
      { key: SYSTEM_SETTING_KEYS.TTS_VOICE, value: "some-voice" },
    ],
  });
  assert.equal(cfg.model, DEFAULT_TTS_MODEL);
  assert.equal(cfg.voice, "some-voice");
});

test("resolveTtsConfigFromRows returns undefined voice when fish-audio has empty voice string", () => {
  const cfg = resolveTtsConfigFromRows({
    tenantRows: [
      { key: SYSTEM_SETTING_KEYS.TTS_MODEL, value: "fish-audio/s2.1-pro" },
      { key: SYSTEM_SETTING_KEYS.TTS_VOICE, value: "" },
    ],
  });
  assert.equal(cfg.model, "fish-audio/s2.1-pro");
  assert.equal(cfg.voice, undefined);
});
