export const ALLOWED_TTS_MODELS = [
  "openai/tts-1",
  "fish-audio/s2.1-pro",
] as const;

export type TtsModel = (typeof ALLOWED_TTS_MODELS)[number];

export const DEFAULT_TTS_MODEL: TtsModel = "openai/tts-1";
export const DEFAULT_TTS_VOICE = "nova";

export const OPENAI_TTS_VOICES = [
  "nova",
  "alloy",
  "echo",
  "fable",
  "onyx",
  "shimmer",
] as const;

export type OpenAiTtsVoice = (typeof OPENAI_TTS_VOICES)[number];

export interface ResolvedTtsConfig {
  model: TtsModel;
  voice: string | undefined;
}

export function isAllowedTtsModel(value: unknown): value is TtsModel {
  return (
    typeof value === "string" &&
    ALLOWED_TTS_MODELS.includes(value as TtsModel)
  );
}

export function resolveTtsConfigFromRows(options: {
  branchRows?: Array<{ key: string; value: string }> | null;
  tenantRows?: Array<{ key: string; value: string }> | null;
}): ResolvedTtsConfig {
  let branchModel: string | undefined;
  let branchVoice: string | undefined;

  if (options.branchRows) {
    for (const row of options.branchRows) {
      if (row.key === "tts_model") {
        branchModel = row.value.trim();
      } else if (row.key === "tts_voice") {
        branchVoice = row.value.trim();
      }
    }
  }

  let tenantModel: string | undefined;
  let tenantVoice: string | undefined;

  if (options.tenantRows) {
    for (const row of options.tenantRows) {
      if (row.key === "tts_model") {
        tenantModel = row.value.trim();
      } else if (row.key === "tts_voice") {
        tenantVoice = row.value.trim();
      }
    }
  }

  const rawModel = branchModel || tenantModel || DEFAULT_TTS_MODEL;
  const model = isAllowedTtsModel(rawModel) ? rawModel : DEFAULT_TTS_MODEL;

  const rawVoice = branchVoice !== undefined ? branchVoice : tenantVoice;
  let voice: string | undefined;
  if (rawVoice !== undefined && rawVoice.length > 0) {
    voice = rawVoice;
  } else if (model === "openai/tts-1") {
    voice = DEFAULT_TTS_VOICE;
  } else {
    voice = undefined;
  }

  return { model, voice };
}
