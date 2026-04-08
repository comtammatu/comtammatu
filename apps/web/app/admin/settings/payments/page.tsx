import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { SYSTEM_SETTING_DEFAULTS } from "@comtammatu/shared/settings";
import { PaymentsForm } from "./payments-form";

export default async function PaymentSettingsPage() {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;
  if (!claims || !["owner", "super_manager"].includes(claims.user_role)) {
    redirect("/admin/settings/tables");
  }

  const { data: rows } = await supabase
    .from("system_settings")
    .select("key, value");

  const settings: Record<string, string> = { ...SYSTEM_SETTING_DEFAULTS };
  if (rows) {
    for (const row of rows) {
      settings[row.key] = row.value;
    }
  }

  const vietqrEnvConfigured =
    !!process.env.VIETQR_API_KEY &&
    !!process.env.VIETQR_ACCOUNT_NO &&
    !!process.env.VIETQR_BANK_ID;

  const momoEnvConfigured =
    !!process.env.MOMO_PARTNER_CODE &&
    !!process.env.MOMO_ACCESS_KEY &&
    !!process.env.MOMO_SECRET_KEY;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Thanh toán</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bật VietQR và MoMo trên POS sau khi đã đặt biến môi trường trên
          hosting (Vercel / server).
        </p>
      </div>
      <PaymentsForm
        settings={settings}
        vietqrEnvConfigured={vietqrEnvConfigured}
        momoEnvConfigured={momoEnvConfigured}
      />
    </div>
  );
}
