import { redirect } from "next/navigation";
import {
  PERMISSION_KEYS,
  STAFF_ROLES,
} from "@comtammatu/shared/auth";
import { AppPageHeader } from "@/components/surface";
import { getAuthContextWithPermission } from "@/(protected)/inventory/_lib/auth";
import {
  parseWasteTierSettingsFromRows,
} from "@comtammatu/shared/settings";
import { messages } from "@lib/messages";
import { WasteSettingsClient } from "./waste-settings-client";

const copy = messages.inventory.settings.waste;

export default async function InventoryWasteSettingsPage() {
  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) {
    redirect("/inventory/settings");
  }

  const { supabase, claims } = ctx;

  const { data: rows } = await supabase
    .from("system_settings")
    .select("key, value")
    .eq("tenant_id", claims.tenant_id)
    .like("key", "inventory_waste_%");

  const initialSettings = parseWasteTierSettingsFromRows(rows ?? []);

  return (
    <div className="flex flex-col gap-4">
      <AppPageHeader title={copy.title} />
      <WasteSettingsClient initialSettings={initialSettings} />
    </div>
  );
}
