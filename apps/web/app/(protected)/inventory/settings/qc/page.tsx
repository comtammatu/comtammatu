import { redirect } from "next/navigation";
import {
  SUPPLIER_RETURN_ROLES,
  PERMISSION_KEYS,
} from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "../../_lib/auth";
import { fetchQcSettingsForForm } from "../../notifications-actions";
import { QcSettingsClient } from "./qc-settings-client";
import { AppPage, AppPageHeader } from "@/components/surface";

export default async function QcSettingsPage() {
  const ctx = await getAuthContextWithPermission(
    SUPPLIER_RETURN_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) redirect("/inventory");

  const res = await fetchQcSettingsForForm();
  const settings = res.success
    ? (res.data as {
        qty_short_tolerance_pct: number;
        price_variance_warn_pct: number;
        price_variance_review_pct: number;
        reject_requires_photo: boolean;
        alert_webhook_url: string | null;
        alert_channel: string;
      })
    : {
        qty_short_tolerance_pct: 5,
        price_variance_warn_pct: 5,
        price_variance_review_pct: 15,
        reject_requires_photo: true,
        alert_webhook_url: null,
        alert_channel: "generic",
      };

  return (
    <AppPage>
      <AppPageHeader
        eyebrow="Cài đặt kho"
        title="Cài đặt kiểm tra chất lượng"
        description="Cấu hình ngưỡng dung sai và kênh thông báo QC."
      />
      <QcSettingsClient initial={settings} />
    </AppPage>
  );
}
