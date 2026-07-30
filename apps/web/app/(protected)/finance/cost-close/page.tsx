import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { getVNDateString } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { CostCloseClient } from "./cost-close-client";
import { getInventoryCostCloseStatus } from "./actions";

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

function resolveMonth(params: {
  year?: string | string[];
  month?: string | string[];
}): string {
  const year = first(params.year);
  const month = first(params.month);
  if (/^\d{4}$/.test(year ?? "") && /^(?:[1-9]|1[0-2])$/.test(month ?? "")) {
    return `${year}-${month!.padStart(2, "0")}`;
  }
  return getVNDateString().slice(0, 7);
}

export default async function InventoryCostClosePage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string | string[];
    month?: string | string[];
  }>;
}) {
  const auth = await loadAuthState();
  if (auth.claims.user_role !== "owner") redirect("/finance");
  const monthValue = resolveMonth(await searchParams);
  const [year, month] = monthValue.split("-").map(Number);
  const result = await getInventoryCostCloseStatus(year!, month!);
  if (!result.success || !result.data) {
    return (
      <AppPage width="wide" density="compact">
        <AppPageHeader
          title={messages.finance.costClose.title}
          description={messages.finance.costClose.description}
        />
        <AppEmptyState
          mode="error"
          title={messages.finance.costClose.loadFailed}
          description={result.error}
        />
      </AppPage>
    );
  }
  return <CostCloseClient status={result.data} monthValue={monthValue} />;
}
