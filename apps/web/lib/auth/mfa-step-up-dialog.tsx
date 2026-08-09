"use client";

import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import { AppDialog } from "@/components/form";
import { MfaChallengeForm } from "@lib/auth/mfa-challenge-form";
import { messages } from "@lib/messages";

const copy = messages.auth.mfa;

type MfaStepUpDialogProps = {
  open: boolean;
  factorId: string | null;
  /** Owner-only enroll surface in V1. */
  canOpenSecuritySettings: boolean;
  securityHref?: string;
  onOpenChange: (open: boolean) => void;
  onVerified: () => void | Promise<void>;
};

export function MfaStepUpDialog({
  open,
  factorId,
  canOpenSecuritySettings,
  securityHref = "/settings/security",
  onOpenChange,
  onVerified,
}: MfaStepUpDialogProps) {
  const hasFactor = factorId != null;
  const showEnrollCta = !hasFactor && canOpenSecuritySettings;

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={copy.stepUpTitle}
      description={
        hasFactor ? copy.stepUpDescription : copy.stepUpMissingFactor
      }
      footer={
        hasFactor ? undefined : (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {copy.cancel}
            </Button>
            {showEnrollCta ? (
              <Button
                render={<Link href={securityHref} />}
                onClick={() => onOpenChange(false)}
              >
                {copy.goToSecuritySettings}
              </Button>
            ) : null}
          </div>
        )
      }
    >
      {hasFactor ? (
        <MfaChallengeForm
          factorId={factorId}
          description={copy.challengeDescription}
          submitLabel={copy.verifyAndContinue}
          onVerified={onVerified}
        />
      ) : null}
    </AppDialog>
  );
}
