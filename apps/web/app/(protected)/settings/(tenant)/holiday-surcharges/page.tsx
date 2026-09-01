import { AppEmptyState } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { SettingsPageFrame } from "../../settings-page-frame";
import { HolidaySurchargesClient } from "./holiday-surcharges-client";
import { holidaySurchargePoliciesSchema } from "./schema";

type HolidaySurchargeListRpcClient = {
  rpc: (name: string) => PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

export default async function HolidaySurchargesPage() {
  const { supabase, claims } = await loadAuthState();
  const rpc = supabase as unknown as HolidaySurchargeListRpcClient;
  const [policyResult, branchResult] = await Promise.all([
    rpc.rpc("get_holiday_surcharge_policies"),
    supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_kind", "branch")
      .eq("is_active", true)
      .order("name"),
  ]);
  const parsedPolicies = holidaySurchargePoliciesSchema.safeParse(
    policyResult.data,
  );
  const hasError =
    !!policyResult.error || !!branchResult.error || !parsedPolicies.success;

  return (
    <SettingsPageFrame
      title={messages.settings.pages.holidaySurchargesTitle}
      description={messages.settings.pages.holidaySurchargesDescription}
      width="wide"
    >
      {hasError ? (
        <AppEmptyState
          mode="error"
          title={messages.settings.holidaySurcharges.loadFailed}
        />
      ) : (
        <HolidaySurchargesClient
          policies={parsedPolicies.data}
          branches={branchResult.data ?? []}
          nowIso={new Date().toISOString()}
        />
      )}
    </SettingsPageFrame>
  );
}
