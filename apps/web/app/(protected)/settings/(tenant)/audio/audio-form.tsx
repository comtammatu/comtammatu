"use client";

import { useState, useTransition } from "react";
import { Button } from "@comtammatu/ui/components/button";
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
  OPENAI_TTS_VOICES,
  type TtsModel,
} from "@comtammatu/shared/settings";
import { messages } from "@lib/messages";
import { primeOperationalVoice } from "@lib/operational-voice";
import { updateTenantAudioSettings } from "./actions";

const copy = messages.settings.audio;

interface TenantAudioFormProps {
  initialModel: TtsModel;
  initialVoice: string;
}

export function TenantAudioForm({
  initialModel,
  initialVoice,
}: TenantAudioFormProps) {
  const [model, setModel] = useState<TtsModel>(initialModel);
  const [voice, setVoice] = useState(initialVoice);
  const [isPending, startTransition] = useTransition();
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  const handlePreview = () => {
    setIsPlayingPreview(true);
    const utterance = copy.previewSampleText;
    try {
      const primed = primeOperationalVoice(utterance);
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
      const res = await updateTenantAudioSettings({
        model,
        voice,
      });
      if (res.success) {
        toast.success(copy.saved);
      } else {
        toast.error(res.error ?? copy.saveFailed);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <SettingsFormSection
        title={copy.modelLabel}
        description={copy.customVoiceHelp}
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
                  setVoice("nova");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={copy.modelLabel} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai/tts-1">{copy.modelOpenAi}</SelectItem>
                <SelectItem value="fish-audio/s2.1-pro">
                  {copy.modelFishAudio}
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
                value={voice || "nova"}
                onValueChange={(val) => setVoice(val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={copy.voiceLabel} />
                </SelectTrigger>
                <SelectContent>
                  {OPENAI_TTS_VOICES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v} {v === "nova" ? "(mặc định)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldContent>
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
