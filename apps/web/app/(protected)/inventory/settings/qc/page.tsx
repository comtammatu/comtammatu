import { redirect } from "next/navigation";
import {
  SUPPLIER_RETURN_ROLES,
  PERMISSION_KEYS,
} from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "../../_lib/auth";
import { fetchQcSettingsForForm } from "../../notifications-actions";
import { QcSettingsClient } from "./qc-settings-client";
import { AppEmptyState, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";

export default async function QcSettingsPage() {
  const ctx = await getAuthContextWithPermission(
    SUPPLIER_RETURN_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) redirect("/inventory");

  const res = await fetchQcSettingsForForm();
  const settings = res.data as
    | {
        qty_short_tolerance_pct: number;
        price_variance_warn_pct: number;
        price_variance_review_pct: number;
        reject_requires_photo: boolean;
      }
    | undefined;

  return (
    <div className="flex flex-col gap-4">
      <AppPageHeader
        eyebrow={messages.settings.qcSettings.eyebrow}
        title={messages.settings.qcSettings.title}
        description={messages.settings.qcSettings.description}
      />
      {!res.success || !settings ? (
        <AppEmptyState
          mode="error"
          title={messages.inventory.settings.qc.loadFailed}
        />
      ) : (
        <QcSettingsClient initial={settings} />
      )}
    </div>
  );
}
