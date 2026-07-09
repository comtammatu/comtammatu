import {
  BranchOperatorControlBarSkeleton,
  BranchOperatorPanelSkeleton,
} from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";

const branchCopy = messages.settings.branch;

export function HubTodayStatusPending() {
  return <BranchOperatorControlBarSkeleton />;
}

export function HubQueuePending() {
  return (
    <BranchOperatorPanelSkeleton
      title={branchCopy.queueTitle}
      tone="warning"
      rows={2}
      size="sm"
    />
  );
}
