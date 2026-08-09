"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { headers } from "next/headers";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  extractClaimsFromAccessToken,
  PERMISSION_KEYS,
  resolvePostLoginRedirect,
} from "@comtammatu/shared/auth";
import { loginRateLimit } from "@comtammatu/security";

const loginSchema = z.object({
  email: z.email({ error: "Email không hợp lệ" }),
  password: z.string().min(1, { error: "Vui lòng nhập mật khẩu" }),
});

// Single generic message for all post-validation failure modes (wrong creds,
// no session post-signIn, no claims). Distinguishable copy leaks credential
// validity → user enumeration oracle. See regressions.md
// LOGIN-MESSAGE-MUST-BE-GENERIC.
const GENERIC_LOGIN_ERROR = "Email hoặc mật khẩu không đúng";

type LoginField = keyof z.infer<typeof loginSchema>;

export interface LoginState {
  error?: string;
  fieldErrors?: Partial<Record<LoginField, string>>;
  mfaRequired?: boolean;
  factorId?: string;
}

function getFieldErrors(error: z.ZodError): LoginState["fieldErrors"] {
  const fieldErrors: LoginState["fieldErrors"] = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if ((field === "email" || field === "password") && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }

  return fieldErrors;
}

async function redirectAfterAuthenticatedSession(): Promise<LoginState> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { error: GENERIC_LOGIN_ERROR };
  }

  const claims = extractClaimsFromAccessToken(session.access_token);
  if (!claims) {
    console.error("auth.login.claims_missing", {
      user_id: session.user.id,
      ts: new Date().toISOString(),
    });
    await supabase.auth.signOut();
    return { error: GENERIC_LOGIN_ERROR };
  }

  // HR Control bindings (JWT self_service + tenant hr:view_employee) land on
  // Control home — same gate as proxy `/`. Branch-floor roles keep /br/[id]
  // even when they also hold hr:view_employee for branch team surfaces.
  if (claims.user_role === "self_service") {
    const { data: canOpenHrHome } = await supabase.rpc("has_permission", {
      p_branch_id: null as unknown as number,
      p_key: PERMISSION_KEYS.HR_VIEW_EMPLOYEE,
    });
    if (canOpenHrHome === true) {
      redirect("/");
    }
  }

  redirect(resolvePostLoginRedirect(claims, null));
}

export async function login(
  _prevState: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors = getFieldErrors(parsed.error);
    return Object.keys(fieldErrors ?? {}).length > 0
      ? { fieldErrors }
      : { error: "Dữ liệu không hợp lệ" };
  }

  const { email, password } = parsed.data;

  // Rate limiting — 10 attempts per 5 min, keyed by IP
  // Bypass in dev via DISABLE_LOGIN_RATE_LIMIT=true
  if (process.env.DISABLE_LOGIN_RATE_LIMIT !== "true") {
    const headerStore = await headers();
    const ip =
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerStore.get("x-real-ip") ??
      "unknown";
    try {
      const { success: allowed } = await loginRateLimit.limit(ip);
      if (!allowed) {
        return { error: "Quá nhiều lần thử. Vui lòng đợi 5 phút." };
      }
    } catch (rateLimitError) {
      // Fail open — Upstash unreachable, allow login to proceed.
      // Cannot persist via log_audit RPC: caller is anonymous (no auth.uid()),
      // RPC raises insufficient_privilege (regressions.md AUDIT-LOG-INSERT-RPC-ONLY).
      // MVP: structured console.error → Vercel log drain.
      console.error("auth.login.rate_limit_failopen", {
        ip,
        error:
          rateLimitError instanceof Error
            ? rateLimitError.message
            : String(rateLimitError),
        ts: new Date().toISOString(),
      });
    }
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: GENERIC_LOGIN_ERROR };
  }

  // Fetch fresh session to get the access token with hook-injected claims
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    // signInWithPassword reported success but session is missing — cookie write
    // failed or was cleared mid-request. Sign out to ensure clean state, log for
    // ops, return generic copy (no enumeration).
    console.error("auth.login.no_session_after_signin", {
      ts: new Date().toISOString(),
    });
    await supabase.auth.signOut();
    return { error: GENERIC_LOGIN_ERROR };
  }

  const claims = extractClaimsFromAccessToken(session.access_token);
  if (!claims) {
    // Auth succeeded but JWT hook didn't emit claims (e.g. profile.is_active=false,
    // missing position_id, hook misconfigured). signInWithPassword already wrote
    // the session cookie; without signOut here, user enters a proxy bounce loop
    // (proxy reads claims=null → /access-denied?reason=missing-auth-context).
    // Generic copy to user (no enumeration); user_id logged for ops debug.
    console.error("auth.login.claims_missing", {
      user_id: session.user.id,
      ts: new Date().toISOString(),
    });
    await supabase.auth.signOut();
    return { error: GENERIC_LOGIN_ERROR };
  }

  // V1: MFA challenge is Owner-only. Staff keep password-only login even if a
  // leftover factor exists from an earlier experiment.
  if (claims.user_role === "owner") {
    const [{ data: aal }, { data: factors }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
    const verifiedTotp = factors?.totp?.[0];
    if (verifiedTotp && aal?.currentLevel !== "aal2") {
      return {
        mfaRequired: true,
        factorId: verifiedTotp.id,
      };
    }
  }

  redirect(resolvePostLoginRedirect(claims, null));
}

/** Complete login after the browser client verifies TOTP and refreshes the session. */
export async function completeLoginAfterMfa(): Promise<LoginState> {
  return redirectAfterAuthenticatedSession();
}
