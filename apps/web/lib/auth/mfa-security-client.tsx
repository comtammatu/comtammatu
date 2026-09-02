"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  CircleAlert as IconAlertCircle,
  ShieldCheck as IconShieldCheck,
  Trash2 as IconTrash2,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppDialog } from "@/components/form";
import { AppSection } from "@/components/surface";
import {
  enrollTotp,
  getAal,
  getVerifiedTotpFactorId,
  listTotpFactors,
  totpQrImageSrc,
  unenrollFactor,
  verifyTotpEnrollment,
  type TotpEnrollment,
  type TotpFactor,
} from "@lib/auth/mfa";
import { MfaChallengeForm } from "@lib/auth/mfa-challenge-form";
import { messages } from "@lib/messages";

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
const copy = messages.auth.mfa;

export function MfaSecurityClient() {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [aal, setAal] = useState<"aal1" | "aal2" | string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [unenrollTarget, setUnenrollTarget] = useState<TotpFactor | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpFactorId, setStepUpFactorId] = useState<string | null>(null);
  const [isEnrolling, startEnroll] = useTransition();
  const [isVerifying, startVerify] = useTransition();
  const [isUnenrolling, startUnenroll] = useTransition();

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [factorResult, aalResult] = await Promise.all([
      listTotpFactors(),
      getAal(),
    ]);
    if (!factorResult.success) {
      setLoadError(factorResult.error);
      setLoading(false);
      return;
    }
    if (!aalResult.success) {
      setLoadError(aalResult.error);
      setLoading(false);
      return;
    }
    setFactors(factorResult.data);
    setAal(aalResult.data.currentLevel);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const verifiedFactors = factors.filter(
    (factor) => factor.status === "verified",
  );
  const hasVerified = verifiedFactors.length > 0;

  function beginEnroll() {
    startEnroll(async () => {
      setEnrollError(null);
      const result = await enrollTotp(copy.defaultFactorName);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setEnrollment(result.data);
      setEnrollCode("");
    });
  }

  function confirmEnroll() {
    if (!enrollment) return;
    const trimmed = enrollCode.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setEnrollError(copy.codeInvalid);
      return;
    }
    startVerify(async () => {
      setEnrollError(null);
      const result = await verifyTotpEnrollment(enrollment.factorId, trimmed);
      if (!result.success) {
        setEnrollError(result.error);
        return;
      }
      setEnrollment(null);
      setEnrollCode("");
      toast.success(copy.enrollSuccess);
      await refresh();
    });
  }

  function requestUnenroll(factor: TotpFactor) {
    setUnenrollTarget(factor);
  }

  function runUnenroll(factorId: string) {
    startUnenroll(async () => {
      const result = await unenrollFactor(factorId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setUnenrollTarget(null);
      setStepUpOpen(false);
      setStepUpFactorId(null);
      toast.success(copy.unenrollSuccess);
      await refresh();
    });
  }

  function confirmUnenroll() {
    if (!unenrollTarget) return;
    if (aal === "aal2") {
      runUnenroll(unenrollTarget.id);
      return;
    }
    startUnenroll(async () => {
      const verified = await getVerifiedTotpFactorId();
      if (!verified.success || !verified.data) {
        toast.error(verified.success ? copy.noFactorForStepUp : verified.error);
        return;
      }
      setStepUpFactorId(verified.data);
      setStepUpOpen(true);
    });
  }

  return (
    <>
      <AppSection
        title={copy.settingsTitle}
        description={copy.settingsDescription}
        icon={<IconShieldCheck />}
      >
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="motion-reduce:animate-none" />
            {copy.loading}
          </div>
        ) : null}

        {loadError ? (
          <Alert variant="destructive">
            <IconAlertCircle />
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : null}

        {!loading && !loadError ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{copy.statusLabel}</span>
              {hasVerified ? (
                <Badge variant="success">{copy.statusEnabled}</Badge>
              ) : (
                <Badge variant="secondary">{copy.statusDisabled}</Badge>
              )}
            </div>

            {verifiedFactors.length > 0 ? (
              <ul className="grid gap-2">
                {verifiedFactors.map((factor) => (
                  <li
                    key={factor.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {factor.friendlyName ?? copy.defaultFactorName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {copy.totpFactorHint}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={copy.unenrollAria}
                      onClick={() => requestUnenroll(factor)}
                    >
                      <IconTrash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {copy.emptyFactors}
              </p>
            )}

            {!enrollment && !hasVerified ? (
              <div>
                <Button
                  type="button"
                  size={isTouchLayout ? "touch" : "default"}
                  onClick={beginEnroll}
                  disabled={isEnrolling}
                >
                  {isEnrolling ? (
                    <>
                      <Spinner className="motion-reduce:animate-none" />
                      {copy.enrolling}
                    </>
                  ) : (
                    copy.enableButton
                  )}
                </Button>
              </div>
            ) : null}

            {enrollment ? (
              <div className="grid gap-4 rounded-lg border border-border/60 p-4">
                <p className="text-sm text-muted-foreground">
                  {copy.enrollInstructions}
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element -- QR is an inline SVG data URI from Supabase */}
                <img
                  src={totpQrImageSrc(enrollment.qrCode)}
                  alt={copy.qrAlt}
                  className="mx-auto size-48 rounded-md bg-white p-2"
                />
                <div className="grid gap-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {copy.secretLabel}
                  </p>
                  <code className="break-all rounded-md bg-muted px-2 py-1 font-mono text-xs">
                    {enrollment.secret}
                  </code>
                </div>
                <FieldGroup>
                  <Field data-invalid={enrollError ? true : undefined}>
                    <FieldLabel htmlFor="mfa-enroll-code">
                      {copy.codeLabel}
                    </FieldLabel>
                    <Input
                      id="mfa-enroll-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder={copy.codePlaceholder}
                      value={enrollCode}
                      onChange={(event) =>
                        setEnrollCode(event.target.value.replace(/\D/g, ""))
                      }
                      disabled={isVerifying}
                    />
                    {enrollError ? (
                      <FieldError>{enrollError}</FieldError>
                    ) : null}
                  </Field>
                </FieldGroup>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size={isTouchLayout ? "touch" : "default"}
                    onClick={confirmEnroll}
                    disabled={isVerifying || enrollCode.length < 6}
                  >
                    {isVerifying ? (
                      <>
                        <Spinner className="motion-reduce:animate-none" />
                        {copy.verifying}
                      </>
                    ) : (
                      copy.confirmEnroll
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size={isTouchLayout ? "touch" : "default"}
                    disabled={isVerifying}
                    onClick={() => {
                      setEnrollment(null);
                      setEnrollCode("");
                      setEnrollError(null);
                    }}
                  >
                    {copy.cancelEnroll}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </AppSection>

      <AppDialog
        open={unenrollTarget != null && !stepUpOpen}
        onOpenChange={(open) => {
          if (!open) setUnenrollTarget(null);
        }}
        title={copy.unenrollTitle}
        description={copy.unenrollDescription}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setUnenrollTarget(null)}
              disabled={isUnenrolling}
            >
              {copy.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={isUnenrolling}
              onClick={confirmUnenroll}
            >
              {isUnenrolling ? (
                <>
                  <Spinner className="motion-reduce:animate-none" />
                  {copy.unenrolling}
                </>
              ) : (
                copy.unenrollConfirm
              )}
            </Button>
          </div>
        }
      />

      <AppDialog
        open={stepUpOpen}
        onOpenChange={(open) => {
          if (!open) {
            setStepUpOpen(false);
            setStepUpFactorId(null);
          }
        }}
        title={copy.stepUpTitle}
        description={copy.stepUpBeforeUnenroll}
      >
        {stepUpFactorId && unenrollTarget ? (
          <MfaChallengeForm
            factorId={stepUpFactorId}
            description={copy.challengeDescription}
            submitLabel={copy.verifyAndContinue}
            onVerified={() => {
              runUnenroll(unenrollTarget.id);
            }}
          />
        ) : null}
      </AppDialog>
    </>
  );
}
