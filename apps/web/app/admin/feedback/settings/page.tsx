import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { loadAuthState } from "@/_lib/auth";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
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
      ? await supabase
          .from("branches")
          .select("id, name")
          .in("id", branchIds)
      : { data: [] };

  const branchNameById = new Map(
    (branchRows ?? []).map((b) => [b.id, b.name]),
  );

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
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Cài đặt phản hồi</h1>
      <Tabs defaultValue="telegram">
        <TabsList>
          <TabsTrigger value="telegram">Telegram</TabsTrigger>
          <TabsTrigger value="ai">AI &amp; Báo cáo</TabsTrigger>
        </TabsList>
        <TabsContent value="telegram" className="mt-4">
          <TelegramDestinationsClient destinations={destinations} />
        </TabsContent>
        <TabsContent value="ai" className="mt-4">
          <AiSettingsClient settings={settings} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
