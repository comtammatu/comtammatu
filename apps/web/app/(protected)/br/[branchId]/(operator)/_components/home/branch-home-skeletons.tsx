import {
  BranchOperatorControlBarSkeleton,
  BranchOperatorPanelSkeleton,
} from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";

const branchCopy = messages.settings.branch;

export function BranchTodayStatusPending() {
  return <BranchOperatorControlBarSkeleton />;
}

export function BranchQueuePending() {
  return (
    <BranchOperatorPanelSkeleton
      title={branchCopy.queueTitle}
      tone="warning"
      rows={2}
      size="sm"
    />
  );
}
