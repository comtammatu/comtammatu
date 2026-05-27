import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { loadAuthState } from "@/_lib/auth";
import { AppPage, AppPageHeader } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { TelegramDestinationsClient } from "./_components/telegram-destinations-client";
import { AiSettingsClient } from "./_components/ai-settings-client";
import { getFeedbackSettings } from "./actions";
import type { TelegramDestRow } from "./_components/telegram-destinations-client";

export default async function FeedbackSettingsPage() {
  const { claims } = await loadAuthState();

  if (claims.user_role !== "owner") {
    redirect("/admin/feedback");
  }

  const supabase = await createClient();

  const [{ data: rawDests }, settingsResult] = await Promise.all([
    supabase
      .from("telegram_destinations")
      .select("id, chat_id, label, branch_id, is_active, created_at")
      .eq("tenant_id", claims.tenant_id)
      .order("created_at", { ascending: false }),
    getFeedbackSettings(),
  ]);

  const branchIds = [
    ...new Set(
      (rawDests ?? [])
        .map((d) => d.branch_id)
        .filter((id): id is number => id !== null),
    ),
  ];
  const { data: branchRows } =
    branchIds.length > 0
      ? await supabase.from("branches").select("id, name").in("id", branchIds)
      : { data: [] };

  const branchNameById = new Map((branchRows ?? []).map((b) => [b.id, b.name]));

  const destinations: TelegramDestRow[] = (rawDests ?? []).map((d) => ({
    id: d.id,
    chat_id: d.chat_id,
    label: d.label,
    branch_name:
      d.branch_id !== null ? (branchNameById.get(d.branch_id) ?? null) : null,
    is_active: d.is_active,
    created_at: d.created_at,
  }));

  const settings =
    settingsResult.success && settingsResult.data
      ? settingsResult.data
      : {
          tenant_id: claims.tenant_id,
          ai_monthly_budget_usd: 5,
          push_mode: "threshold" as const,
          threshold_rating: 3,
          daily_report_hour_local: 8,
          updated_at: new Date().toISOString(),
          updated_by: null,
        };

  return (
    <AppPage>
      <AppPageHeader
        title="Cài đặt phản hồi"
        description="Cấu hình thông báo Telegram và tự động hoá AI cho phản hồi khách hàng."
      />
      <AppPageTabs
        items={[
          { value: "telegram", label: "Telegram" },
          { value: "ai", label: "AI & Báo cáo" },
        ]}
        defaultValue="telegram"
      >
        <TabsContent value="telegram" className="mt-4">
          <TelegramDestinationsClient destinations={destinations} />
        </TabsContent>
        <TabsContent value="ai" className="mt-4">
          <AiSettingsClient settings={settings} />
        </TabsContent>
      </AppPageTabs>
    </AppPage>
  );
}
