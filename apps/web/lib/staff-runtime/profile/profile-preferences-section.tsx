"use client";

import { useEffect, useState } from "react";
import { Volume2 as IconVolume, VolumeX as IconVolumeMute } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Switch } from "@comtammatu/ui/components/switch";
import { FieldGroup } from "@comtammatu/ui/components/field";
import { toast } from "@comtammatu/ui/components/sonner";
import { readDevicePref, writeDevicePref } from "@lib/device-prefs";
import { playAppSignal } from "@lib/audio-signal";
import { messages } from "@lib/messages";

const PREF_KEY = "staff_sound_alerts_enabled";

export function ProfilePreferencesSection() {
  const copy = messages.employee.profile;
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    const val = readDevicePref(PREF_KEY);
    if (val !== null) {
      setSoundEnabled(val !== "false");
    }
  }, []);

  function handleToggleSound(checked: boolean) {
    setSoundEnabled(checked);
    writeDevicePref(PREF_KEY, String(checked));
    if (checked) {
      playAppSignal("pos");
    }
  }

  function handleTestSound() {
    playAppSignal("pos");
    toast.success(copy.testSoundSuccess);
  }

  return (
    <FieldGroup className="gap-3 p-3">
      <div className="flex flex-col gap-1">
        <p className="font-heading text-sm font-semibold">
          {copy.deviceSettingsTitle}
        </p>
        <p className="text-xs text-muted-foreground">
          {copy.deviceSettingsDescription}
        </p>
      </div>

      <div className="flex flex-col gap-3 pt-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            {soundEnabled ? (
              <IconVolume className="size-4 text-primary shrink-0" />
            ) : (
              <IconVolumeMute className="size-4 text-muted-foreground shrink-0" />
            )}
            <div className="flex flex-col">
              <span className="font-medium">{copy.soundAlertsLabel}</span>
              <span className="text-muted-foreground">
                {copy.soundAlertsDescription}
              </span>
            </div>
          </div>
          <Switch
            checked={soundEnabled}
            onCheckedChange={handleToggleSound}
            aria-label={copy.soundAlertsLabel}
          />
        </div>

        {soundEnabled ? (
          <div className="flex items-center justify-start pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleTestSound}
            >
              <IconVolume className="size-3.5 mr-1" />
              {copy.testSoundButton}
            </Button>
          </div>
        ) : null}
      </div>
    </FieldGroup>
  );
}
