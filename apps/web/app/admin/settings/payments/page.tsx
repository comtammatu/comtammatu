import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { SYSTEM_SETTING_DEFAULTS } from "@comtammatu/shared/settings";
import { PaymentsForm } from "./payments-form";

export default async function PaymentSettingsPage() {
  const { supabase, claims } = await loadAuthState();

  if (!["owner", "super_manager"].includes(claims.user_role)) {
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
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Thanh toán</h1>
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
