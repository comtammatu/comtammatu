import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { AppPage, AppPageHeader, AppEmptyState } from "@/components/surface";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { messages } from "@lib/messages";
import { fetchAccessibleBranches } from "../actions";
import { listSummaryRunQueue } from "../summary-invoice-actions";
import { SummaryClient } from "./summary-client";
import type { AccessibleBranch, SummaryQueueRow } from "./types";

export default async function SummaryPage() {
  const copy = messages.finance.summaryPage;

  // Direct-URL authz re-check. Mirrors the finance nav visibility gate in
  // ../layout.tsx (showSummary = SETTINGS_TENANT); nav hiding alone does not
  // protect the route from direct navigation.
  const allowed = await currentUserHasPermissionAny(
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!allowed) {
    return (
      <AppPage width="wide" density="compact">
        <AppPageHeader
          eyebrow={copy.eyebrow}
          title={copy.title}
          description={copy.description}
        />
        <AppEmptyState
          mode="no-access"
          title={copy.noAccessTitle}
          description={copy.noAccessDescription}
        />
      </AppPage>
    );
  }

  const [branchesRes, queueRes] = await Promise.all([
    fetchAccessibleBranches(),
    listSummaryRunQueue(null, 30),
  ]);

  const branches = (
    branchesRes.success ? (branchesRes.data ?? []) : []
  ) as AccessibleBranch[];

  if (!queueRes.success) {
    return (
      <AppPage width="wide" density="compact">
        <AppPageHeader
          eyebrow={copy.eyebrow}
          title={copy.title}
          description={copy.description}
        />
        <AppEmptyState
          mode="error"
          title={copy.loadErrorTitle}
          description={copy.loadErrorDescription}
        />
      </AppPage>
    );
  }

  const queue = (queueRes.data ?? []) as SummaryQueueRow[];

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
      />
      <SummaryClient initialBranches={branches} initialQueue={queue} />
    </AppPage>
  );
}
