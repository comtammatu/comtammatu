export type GrabRelayAction = "create" | "amend" | "cancel";

export type ExistingGrabRelayOrder = {
  id: number;
  status: string;
  payment_status: string | null;
};

export type GrabRelayExistingDecision =
  | { kind: "create" }
  | { kind: "noop_cancel" }
  | { kind: "idempotent" }
  | { kind: "amend" }
  | { kind: "cancel" }
  | { kind: "reject"; reason: "paid_or_terminal" };

const TERMINAL_ORDER_STATUSES = new Set(["completed", "cancelled"]);

function isPaidOrTerminal(existing: ExistingGrabRelayOrder): boolean {
  return (
    existing.payment_status === "paid" ||
    TERMINAL_ORDER_STATUSES.has(existing.status)
  );
}

export function normalizeGrabRelayAction(
  value: string | undefined,
): GrabRelayAction {
  if (value === "amend" || value === "cancel") return value;
  return "create";
}

/**
 * Old 1.1.11 clients omit action and fingerprint: existing rows stay
 * create-idempotent. Amend/cancel only run when the new client is explicit.
 */
export function resolveGrabRelayExistingDecision(input: {
  action?: string;
  existing: ExistingGrabRelayOrder | null;
  contentFingerprint?: string;
}): GrabRelayExistingDecision {
  const action = normalizeGrabRelayAction(input.action);

  if (!input.existing) {
    return action === "cancel" ? { kind: "noop_cancel" } : { kind: "create" };
  }

  if (action === "cancel") {
    if (input.existing.status === "cancelled") {
      return { kind: "idempotent" };
    }
    if (isPaidOrTerminal(input.existing)) {
      return { kind: "reject", reason: "paid_or_terminal" };
    }
    return { kind: "cancel" };
  }

  if (action === "amend") {
    if (isPaidOrTerminal(input.existing)) {
      return { kind: "reject", reason: "paid_or_terminal" };
    }
    if (!input.contentFingerprint) {
      return { kind: "idempotent" };
    }
    return { kind: "amend" };
  }

  return { kind: "idempotent" };
}
