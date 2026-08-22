import { notFound, redirect } from "next/navigation";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import {
  SYSTEM_SETTING_KEYS,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  isAllowedTtsModel,
  type TtsModel,
} from "@comtammatu/shared/settings";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { BranchAudioForm } from "./audio-form";

export default async function BranchAudioSettingsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const { supabase, claims } = await loadAuthState();

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect(`/br/${branchId}/settings`);
  }

  const [branchRes, branchSettingsRes, tenantSettingsRes] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, is_active")
      .eq("id", branchId)
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("branch_settings")
      .select("key, value")
      .eq("branch_id", branchId),
    supabase
      .from("system_settings")
      .select("key, value")
      .eq("tenant_id", claims.tenant_id)
      .in("key", [
        SYSTEM_SETTING_KEYS.TTS_MODEL,
        SYSTEM_SETTING_KEYS.TTS_VOICE,
      ]),
  ]);

  if (branchRes.error || !branchRes.data) notFound();

  let branchModel: string | undefined;
  let branchVoice: string | undefined;
  if (branchSettingsRes.data) {
    for (const row of branchSettingsRes.data) {
      if (row.key === SYSTEM_SETTING_KEYS.TTS_MODEL) {
        branchModel = row.value;
      } else if (row.key === SYSTEM_SETTING_KEYS.TTS_VOICE) {
        branchVoice = row.value;
      }
    }
  }

  let tenantModel: string | undefined;
  let tenantVoice: string | undefined;
  if (tenantSettingsRes.data) {
    for (const row of tenantSettingsRes.data) {
      if (row.key === SYSTEM_SETTING_KEYS.TTS_MODEL) {
        tenantModel = row.value;
      } else if (row.key === SYSTEM_SETTING_KEYS.TTS_VOICE) {
        tenantVoice = row.value;
      }
    }
  }

  const resolvedTenantModel: TtsModel = isAllowedTtsModel(tenantModel)
    ? tenantModel
    : DEFAULT_TTS_MODEL;
  const resolvedTenantVoice =
    tenantVoice !== undefined ? tenantVoice : DEFAULT_TTS_VOICE;

  const hasBranchOverride = branchModel !== undefined;
  const initialModel: TtsModel = isAllowedTtsModel(branchModel)
    ? branchModel
    : resolvedTenantModel;
  const initialVoice =
    branchVoice !== undefined ? branchVoice : resolvedTenantVoice;

  const copy = messages.settings.branch;

  return (
    <BranchOperatorPage
      title={copy.audioSetupTitle}
      description={`${branchRes.data.name} · ${copy.audioSetupDescription}`}
    >
      <BranchOperatorPanel
        title={messages.settings.audio.providerSectionTitle}
        description={messages.settings.audio.providerSectionDescription}
      >
        <BranchAudioForm
          branchId={branchId}
          initialInherit={!hasBranchOverride}
          initialModel={initialModel}
          initialVoice={initialVoice}
          tenantDefaultModel={resolvedTenantModel}
          tenantDefaultVoice={resolvedTenantVoice}
        />
      </BranchOperatorPanel>
    </BranchOperatorPage>
  );
}
