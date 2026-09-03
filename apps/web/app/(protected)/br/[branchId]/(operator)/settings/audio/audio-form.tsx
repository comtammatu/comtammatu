"use client";

import { useState, useTransition } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { Switch } from "@comtammatu/ui/components/switch";
import { Input } from "@comtammatu/ui/components/input";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { Play } from "lucide-react";
import { SettingsFormSection } from "@/components/settings-form-section";
import {
  DEFAULT_TTS_VOICE,
  OPENAI_TTS_VOICES,
  type TtsModel,
} from "@comtammatu/shared/settings";
import { messages } from "@lib/messages";
import { primeOperationalVoice } from "@lib/operational-voice";
import { updateBranchAudioSettings } from "./actions";

const copy = messages.settings.audio;

interface BranchAudioFormProps {
  branchId: number;
  initialInherit: boolean;
  initialModel: TtsModel;
  initialVoice: string;
  tenantDefaultModel: TtsModel;
  tenantDefaultVoice: string;
}

export function BranchAudioForm({
  branchId,
  initialInherit,
  initialModel,
  initialVoice,
  tenantDefaultModel,
  tenantDefaultVoice,
}: BranchAudioFormProps) {
  const [inherit, setInherit] = useState(initialInherit);
  const [model, setModel] = useState<TtsModel>(initialModel);
  const [voice, setVoice] = useState(initialVoice);
  const [isPending, startTransition] = useTransition();
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  const handlePreview = () => {
    setIsPlayingPreview(true);
    const utterance = copy.previewSampleText;
    try {
      const primed = primeOperationalVoice(utterance, branchId);
      primed.play();
    } catch {
      toast.error("Không thể phát âm thanh xem trước.");
    } finally {
      setTimeout(() => {
        setIsPlayingPreview(false);
      }, 2000);
    }
  };

  const handleSave = () => {
    startTransition(async () => {
      const res = await updateBranchAudioSettings({
        branchId,
        inherit,
        model: inherit ? undefined : model,
        voice: inherit ? undefined : voice,
      });
      if (res.success) {
        toast.success(copy.saved);
      } else {
        toast.error(res.error ?? copy.saveFailed);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Inherit toggle */}
      <SettingsFormSection
        title={copy.inheritTenantLabel}
        description={`${copy.inheritTenantHelp} (${
          tenantDefaultModel === "fish-audio/s2.1-pro"
            ? copy.modelFishAudio
            : copy.modelOpenAi
        }${tenantDefaultVoice ? ` · ${tenantDefaultVoice}` : ""})`}
      >
        <div className="flex items-center justify-between gap-4">
          <label
            htmlFor="inherit-toggle"
            className="text-sm font-medium leading-none cursor-pointer"
          >
            {copy.inheritTenantLabel}
          </label>
          <Switch
            id="inherit-toggle"
            checked={inherit}
            onCheckedChange={setInherit}
          />
        </div>
      </SettingsFormSection>

      {!inherit ? (
        <SettingsFormSection
          title={copy.customBranchLabel}
        >
          {/* Model selection */}
          <Field>
            <FieldLabel>{copy.modelLabel}</FieldLabel>
            <FieldContent>
              <Select
                value={model}
                onValueChange={(val) => {
                  const newModel = val as TtsModel;
                  setModel(newModel);
                  if (newModel === "openai/tts-1" && !voice) {
                    setVoice(DEFAULT_TTS_VOICE);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={copy.modelLabel} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai/tts-1">
                    {copy.modelOpenAi}
                  </SelectItem>
                  <SelectItem value="fish-audio/s2.1-pro">
                    {copy.modelFishAudio}
                  </SelectItem>
                  <SelectItem value="fish-audio/s2-pro">
                    {copy.modelFishAudioS2Pro}
                  </SelectItem>
                  <SelectItem value="fish-audio/s1">
                    {copy.modelFishAudioS1}
                  </SelectItem>
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>

          {/* Voice selection */}
          {model === "openai/tts-1" ? (
            <Field>
              <FieldLabel>{copy.voiceLabel}</FieldLabel>
              <FieldContent>
                <Select
                  value={voice || DEFAULT_TTS_VOICE}
                  onValueChange={(val) => setVoice(val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={copy.voiceLabel} />
                  </SelectTrigger>
                  <SelectContent>
                    {OPENAI_TTS_VOICES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v} {v === DEFAULT_TTS_VOICE ? "(mặc định)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldContent>
              <FieldDescription>{copy.voiceHelp}</FieldDescription>
            </Field>
          ) : (
            <Field>
              <FieldLabel>{copy.customVoiceLabel}</FieldLabel>
              <FieldContent>
                <Input
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  placeholder={copy.voiceDefaultFishAudio}
                />
              </FieldContent>
              <FieldDescription>{copy.customVoiceHelp}</FieldDescription>
            </Field>
          )}
        </SettingsFormSection>
      ) : null}

      {/* Preview and Save actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={handlePreview}
          disabled={isPlayingPreview}
          className="gap-2"
        >
          {isPlayingPreview ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {isPlayingPreview ? copy.previewPlaying : copy.previewButton}
        </Button>

        <Button onClick={handleSave} disabled={isPending} className="gap-2">
          {isPending ? <Spinner className="h-4 w-4" /> : null}
          {copy.saveSettings}
        </Button>
      </div>
    </div>
  );
}
