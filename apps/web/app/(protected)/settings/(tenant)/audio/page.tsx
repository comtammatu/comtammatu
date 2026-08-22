import { loadAuthState } from "@/_lib/auth";
import {
  SYSTEM_SETTING_KEYS,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  isAllowedTtsModel,
  type TtsModel,
} from "@comtammatu/shared/settings";
import { messages } from "@lib/messages";
import { SettingsPageFrame } from "../../settings-page-frame";
import { TenantAudioForm } from "./audio-form";

export default async function TenantAudioSettingsPage() {
  const { supabase, claims } = await loadAuthState();

  const { data: rows } = await supabase
    .from("system_settings")
    .select("key, value")
    .eq("tenant_id", claims.tenant_id)
    .in("key", [
      SYSTEM_SETTING_KEYS.TTS_MODEL,
      SYSTEM_SETTING_KEYS.TTS_VOICE,
    ]);

  let tenantModel: string | undefined;
  let tenantVoice: string | undefined;

  if (rows) {
    for (const row of rows) {
      if (row.key === SYSTEM_SETTING_KEYS.TTS_MODEL) {
        tenantModel = row.value;
      } else if (row.key === SYSTEM_SETTING_KEYS.TTS_VOICE) {
        tenantVoice = row.value;
      }
    }
  }

  const initialModel: TtsModel = isAllowedTtsModel(tenantModel)
    ? tenantModel
    : DEFAULT_TTS_MODEL;
  const initialVoice =
    tenantVoice !== undefined ? tenantVoice : DEFAULT_TTS_VOICE;

  const copy = messages.settings.pages;

  return (
    <SettingsPageFrame
      title={copy.audioTitle}
      description={copy.audioDescription}
    >
      <TenantAudioForm
        initialModel={initialModel}
        initialVoice={initialVoice}
      />
    </SettingsPageFrame>
  );
}
