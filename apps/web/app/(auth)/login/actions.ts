"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { headers } from "next/headers";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, getDefaultRedirect } from "@comtammatu/shared/auth";
import { loginRateLimit } from "@comtammatu/security";

const loginSchema = z.object({
  email: z.email({ error: "Email không hợp lệ" }),
  password: z.string().min(1, { error: "Vui lòng nhập mật khẩu" }),
});

interface LoginState {
  error: string;
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
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const { email, password } = parsed.data;

  // Rate limiting — 5 attempts per 15 min, keyed by IP
  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    "unknown";
  try {
    const { success: allowed } = await loginRateLimit.limit(ip);
    if (!allowed) {
      return { error: "Quá nhiều lần thử. Vui lòng đợi 15 phút." };
    }
  } catch (error) {
    // Fail open — Upstash unreachable, allow login to proceed
    console.error("loginRateLimit.limit failed (fail-open)", { ip, error });
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Email hoặc mật khẩu không đúng" };
  }

  // Fetch fresh user to get JWT with custom claims
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Không thể xác thực. Vui lòng thử lại." };
  }

  const claims = extractClaims(user.app_metadata);
  if (!claims) {
    return { error: "Tài khoản chưa được phân quyền. Liên hệ quản lý." };
  }

  redirect(getDefaultRedirect(claims));
}
