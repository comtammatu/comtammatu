import type { PublicSelfOrderSnapshot } from "@lib/self-order/contracts";

export type SelfOrderCapabilityBoundary =
  | "origin_pending"
  | "join_pending"
  | "approved";

export interface SelfOrderPrivacyTransitionInput {
  previousIdentity: string | null;
  currentIdentity: string | null;
  previousBoundary: SelfOrderCapabilityBoundary | null;
  currentBoundary: SelfOrderCapabilityBoundary | null;
  currentAccess: PublicSelfOrderSnapshot["access"];
  currentSeatingAccess: PublicSelfOrderSnapshot["seatingAccess"];
  deviceDenied: boolean;
  recoveryExpired: boolean;
  pendingHadSubmittedBatch: boolean;
  exactPendingDraft: boolean;
}

export interface SelfOrderPrivacyTransition {
  reset: boolean;
  preserveCart: boolean;
}

function isPendingBoundary(
  boundary: SelfOrderCapabilityBoundary | null,
): boolean {
  return boundary === "origin_pending" || boundary === "join_pending";
}

export function getSelfOrderCapabilityBoundary(
  snapshot: PublicSelfOrderSnapshot,
): SelfOrderCapabilityBoundary | null {
  return snapshot.access === "origin_pending" ||
    snapshot.access === "join_pending" ||
    snapshot.access === "approved"
    ? snapshot.access
    : null;
}

export function getSelfOrderSeatingIdentity(
  snapshot: PublicSelfOrderSnapshot,
): string | null {
  if (snapshot.session?.createdAt) {
    return `session:${snapshot.session.createdAt}`;
  }
  if (
    snapshot.deviceRecovery === "expired" &&
    snapshot.access === "public" &&
    snapshot.seatingAccess === "join_required"
  ) {
    return "recovery:join_required";
  }
  if (
    (snapshot.access === "origin_pending" ||
      snapshot.access === "join_pending") &&
    snapshot.deviceRequest?.deviceId
  ) {
    return `device:${snapshot.deviceRequest.deviceId}`;
  }
  return null;
}

export function resolveSelfOrderPrivacyTransition({
  previousIdentity,
  currentIdentity,
  previousBoundary,
  currentBoundary,
  currentAccess,
  currentSeatingAccess,
  deviceDenied,
  recoveryExpired,
  pendingHadSubmittedBatch,
  exactPendingDraft,
}: SelfOrderPrivacyTransitionInput): SelfOrderPrivacyTransition {
  const pendingApprovalPromotion =
    isPendingBoundary(previousBoundary) && currentBoundary === "approved";
  const recoveryJoinPromotion =
    previousIdentity === "recovery:join_required" &&
    isPendingBoundary(currentBoundary);
  const identityChanged =
    previousIdentity !== null &&
    currentIdentity !== null &&
    previousIdentity !== currentIdentity &&
    !pendingApprovalPromotion &&
    !recoveryJoinPromotion;
  const identityDisappeared =
    previousIdentity !== null && currentIdentity === null;
  const capabilityExited =
    previousBoundary !== null && (currentAccess === "public" || deviceDenied);
  const reset = identityChanged || identityDisappeared || capabilityExited;
  const preserveCart =
    reset &&
    !deviceDenied &&
    recoveryExpired &&
    currentSeatingAccess === "join_required" &&
    ((isPendingBoundary(previousBoundary) &&
      (!pendingHadSubmittedBatch || exactPendingDraft)) ||
      previousBoundary === "approved");

  return { reset, preserveCart };
}
