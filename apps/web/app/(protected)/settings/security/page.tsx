import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { MfaSecurityClient } from "@lib/auth/mfa-security-client";
import { messages } from "@lib/messages";
import { SettingsPageFrame } from "../settings-page-frame";

const copy = messages.auth.mfa.pages;

/** V1: MFA enroll/unenroll is Owner-only. */
export default async function SettingsSecurityPage() {
  const { claims } = await loadAuthState();
  if (claims.user_role !== "owner") {
    redirect("/access-denied?reason=owner-only");
  }

  return (
    <SettingsPageFrame
      title={copy.settingsSecurityTitle}
      description={copy.settingsSecurityDescription}
    >
      <MfaSecurityClient />
    </SettingsPageFrame>
  );
}
