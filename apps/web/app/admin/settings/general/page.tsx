import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { getTenantInfo } from "./actions";
import { GeneralSettingsForm } from "./general-settings-form";

export default async function GeneralSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const claims = user ? extractClaims(user.app_metadata) : null;
  const userRole = claims?.user_role ?? null;
  const canEdit = userRole === "owner" || userRole === "super_manager";

  const result = await getTenantInfo();

  if (!result.success || !result.data) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cài đặt chung</h1>
          <p className="mt-1 text-muted-foreground">Thông tin pháp lý và cửa hàng</p>
        </div>
        <p className="text-destructive">{result.error ?? "Không thể tải thông tin"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cài đặt chung</h1>
        <p className="mt-1 text-muted-foreground">Thông tin pháp lý và cửa hàng</p>
      </div>

      <div className="max-w-2xl">
        <GeneralSettingsForm tenant={result.data} canEdit={canEdit} />
      </div>
    </div>
  );
}
