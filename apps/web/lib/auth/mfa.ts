"use client";

import { createClient } from "@comtammatu/database/supabase/client";
import { messages } from "@lib/messages";

export type TotpFactor = {
  id: string;
  friendlyName: string | null;
  status: "verified" | "unverified";
};

export type AalSnapshot = {
  currentLevel: "aal1" | "aal2" | string | null;
  nextLevel: "aal1" | "aal2" | string | null;
};

export type TotpEnrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
};

export type MfaResult<T> =
  { success: true; data: T } | { success: false; error: string };

const GENERIC_MFA_ERROR = messages.auth.mfa.genericError;

export async function getAal(): Promise<MfaResult<AalSnapshot>> {
  const supabase = createClient();
  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) {
    return { success: false, error: GENERIC_MFA_ERROR };
  }
  return {
    success: true,
    data: {
      currentLevel: data.currentLevel,
      nextLevel: data.nextLevel,
    },
  };
}

export async function listTotpFactors(): Promise<MfaResult<TotpFactor[]>> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) {
    return { success: false, error: GENERIC_MFA_ERROR };
  }

  const factors = data.all
    .filter((factor) => factor.factor_type === "totp")
    .map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name ?? null,
      status: factor.status,
    }));

  return { success: true, data: factors };
}

export async function getVerifiedTotpFactorId(): Promise<
  MfaResult<string | null>
> {
  const listed = await listTotpFactors();
  if (!listed.success) return listed;
  const verified = listed.data.find((factor) => factor.status === "verified");
  return { success: true, data: verified?.id ?? null };
}

/** Shown in authenticator apps. Must not contain `:` — Supabase defaults to
 * Site URL host (`localhost:3000` in local), which breaks otpauth label parsing. */
const TOTP_ISSUER = "Cơm Tấm Má Tư";

export async function enrollTotp(
  friendlyName = "Authenticator",
): Promise<MfaResult<TotpEnrollment>> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName,
    issuer: TOTP_ISSUER,
  });
  if (error || !data || data.type !== "totp") {
    return { success: false, error: GENERIC_MFA_ERROR };
  }

  return {
    success: true,
    data: {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    },
  };
}

export async function verifyTotpEnrollment(
  factorId: string,
  code: string,
): Promise<MfaResult<void>> {
  const supabase = createClient();
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) {
    return { success: false, error: GENERIC_MFA_ERROR };
  }

  const verified = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: code.trim(),
  });
  if (verified.error) {
    return { success: false, error: GENERIC_MFA_ERROR };
  }

  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.error) {
    return { success: false, error: GENERIC_MFA_ERROR };
  }

  return { success: true, data: undefined };
}

export async function challengeAndVerifyTotp(
  factorId: string,
  code: string,
): Promise<MfaResult<void>> {
  const supabase = createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: code.trim(),
  });
  if (error) {
    return { success: false, error: GENERIC_MFA_ERROR };
  }

  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.error) {
    return { success: false, error: GENERIC_MFA_ERROR };
  }

  return { success: true, data: undefined };
}

export async function unenrollFactor(
  factorId: string,
): Promise<MfaResult<void>> {
  const supabase = createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    return { success: false, error: GENERIC_MFA_ERROR };
  }
  return { success: true, data: undefined };
}

export function totpQrImageSrc(qrCode: string): string {
  if (qrCode.startsWith("data:")) return qrCode;
  return `data:image/svg+xml;utf-8,${qrCode}`;
}
