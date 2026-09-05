"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  playOperationalAlert,
  selectPosGuestAlert,
  type OperationalAudioMode,
  type PosGuestAlertCandidate,
} from "@lib/operational-audio";
import { triggerHapticFeedback } from "@lib/haptic-feedback";
import {
  fetchSelfOrderPosState,
  type SelfOrderPaymentCallKind,
  type SelfOrderPendingPaymentRequest,
  type SelfOrderPendingRequest,
  type SelfOrderPendingStaffCall,
  type SelfOrderPosState,
} from "../self-order-actions";
import type { BranchTable } from "../page";
import type { SessionOrder } from "../order-history";
import {
  tableLabelForOrderId,
  tableLabelForTableId,
} from "../_lib/table-label";

const EMPTY_SELF_ORDER_STATE: SelfOrderPosState = {
  requests: [],
  paymentRequests: [],
  staffCalls: [],
};

export interface UseSelfOrderPosStateArgs {
  branchId: number;
  audioMode: OperationalAudioMode;
  tables: readonly BranchTable[];
  orders: readonly SessionOrder[];
  /** Filled by the shell's private branch-ops bus for instant QR alerts. */
  selfOrderSignalRef: MutableRefObject<(() => void) | null>;
  refreshOperational: () => Promise<void> | void;
}

export interface UseSelfOrderPosStateReturn {
  state: SelfOrderPosState;
  syncFailed: boolean;
  actionVisible: boolean;
  approvalOpen: boolean;
  selectedRequestId: number | null;
  setApprovalOpen: (open: boolean) => void;
  setSelectedRequestId: (id: number | null) => void;
  refresh: () => Promise<void>;
  refreshWorkflow: () => Promise<void>;
  handleOpenApproval: () => void;
  openApprovalForRequest: (requestId: number) => void;
  pendingSelfOrderRequestByTable: ReadonlyMap<number, SelfOrderPendingRequest>;
  pendingSelfOrderTableIds: ReadonlySet<number>;
  staffCallByTable: ReadonlyMap<number, SelfOrderPendingStaffCall>;
  staffCallTableIds: ReadonlySet<number>;
  selfOrderTableNumberById: ReadonlyMap<number, number>;
  selfOrderPaymentRequestByOrder: ReadonlyMap<
    number,
    SelfOrderPendingPaymentRequest
  >;
  paymentCallByOrderId: ReadonlyMap<number, SelfOrderPaymentCallKind>;
}

/**
 * Owns QR self-order poll, guest-alert tones, and the approval-sheet cluster.
 * The 30s poll is a safety net; the shell bus calls `refresh` immediately.
 */
export function useSelfOrderPosState({
  branchId,
  audioMode,
  tables,
  orders,
  selfOrderSignalRef,
  refreshOperational,
}: UseSelfOrderPosStateArgs): UseSelfOrderPosStateReturn {
  const [state, setState] = useState<SelfOrderPosState>(EMPTY_SELF_ORDER_STATE);
  const [syncFailed, setSyncFailed] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(
    null,
  );
  const [approvalOpen, setApprovalOpen] = useState(false);
  const knownRequestIdsRef = useRef<Set<number> | null>(null);
  const knownPaymentIdsRef = useRef<Set<number> | null>(null);
  const knownStaffCallIdsRef = useRef<Set<number> | null>(null);
  const loadGenerationRef = useRef(0);
  const tablesRef = useRef(tables);
  const ordersRef = useRef(orders);
  tablesRef.current = tables;
  ordersRef.current = orders;

  const refresh = useCallback(async () => {
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    const result = await fetchSelfOrderPosState(branchId).catch(() => null);
    if (generation !== loadGenerationRef.current) {
      return;
    }
    if (!result?.success) {
      setSyncFailed(true);
      return;
    }

    const nextState = result.data ?? EMPTY_SELF_ORDER_STATE;
    const nextRequestIds = new Set(
      nextState.requests.map((request) => request.id),
    );
    const nextPaymentIds = new Set(
      nextState.paymentRequests.map((request) => request.id),
    );
    const nextStaffCalls = nextState.staffCalls ?? [];
    const nextStaffCallIds = new Set(nextStaffCalls.map((call) => call.id));
    const knownRequestIds = knownRequestIdsRef.current;
    const knownPaymentIds = knownPaymentIdsRef.current;
    const knownStaffCallIds = knownStaffCallIdsRef.current;
    const guestAlerts: PosGuestAlertCandidate[] = [];
    if (knownRequestIds !== null) {
      const newRequest = nextState.requests.find(
        (request) => !knownRequestIds.has(request.id),
      );
      if (newRequest) {
        guestAlerts.push({
          kind: "pos.self_order",
          tableLabel: tableLabelForTableId(
            tablesRef.current,
            newRequest.tableId,
          ),
        });
      }
    }
    if (knownPaymentIds !== null) {
      const newPayment = nextState.paymentRequests.find(
        (request) => !knownPaymentIds.has(request.id),
      );
      if (newPayment) {
        guestAlerts.push({
          kind: "pos.payment_call",
          tableLabel: tableLabelForOrderId(
            tablesRef.current,
            ordersRef.current,
            newPayment.orderId,
          ),
        });
      }
    }
    if (knownStaffCallIds !== null) {
      const newStaffCall = nextStaffCalls.find(
        (call) => !knownStaffCallIds.has(call.id),
      );
      if (newStaffCall) {
        guestAlerts.push({
          kind: "pos.staff_call",
          tableLabel: tableLabelForTableId(
            tablesRef.current,
            newStaffCall.tableId,
          ),
        });
      }
    }
    const guestAlert = selectPosGuestAlert(guestAlerts);
    if (guestAlert) {
      triggerHapticFeedback(
        guestAlert.kind === "pos.staff_call" ? "call" : "warning",
      );
      playOperationalAlert({
        kind: guestAlert.kind,
        mode: audioMode,
        branchId,
        slots: { tableLabel: guestAlert.tableLabel },
      });
    }
    knownRequestIdsRef.current = nextRequestIds;
    knownPaymentIdsRef.current = nextPaymentIds;
    knownStaffCallIdsRef.current = nextStaffCallIds;
    setSyncFailed(false);
    setState(nextState);
  }, [audioMode, branchId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 30_000);
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      loadGenerationRef.current += 1;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  // Assign in the render body so the bus always calls the latest closure.
  selfOrderSignalRef.current = refresh;
  useEffect(() => {
    return () => {
      selfOrderSignalRef.current = null;
    };
  }, [selfOrderSignalRef]);

  const refreshWorkflow = useCallback(async () => {
    await Promise.all([refresh(), refreshOperational()]);
  }, [refresh, refreshOperational]);

  const actionVisible = syncFailed || state.requests.length > 0;
  const handleOpenApproval = useCallback(() => {
    if (syncFailed && state.requests.length === 0) {
      void refresh();
      return;
    }
    if (syncFailed) void refresh();
    setSelectedRequestId(null);
    setApprovalOpen(true);
  }, [refresh, state.requests.length, syncFailed]);

  const openApprovalForRequest = useCallback((requestId: number) => {
    setSelectedRequestId(requestId);
    setApprovalOpen(true);
  }, []);

  useEffect(() => {
    if (
      selectedRequestId !== null &&
      !state.requests.some((request) => request.id === selectedRequestId)
    ) {
      setSelectedRequestId(null);
    }
  }, [selectedRequestId, state.requests]);

  const pendingSelfOrderRequestByTable = useMemo(
    () =>
      new Map(state.requests.map((request) => [request.tableId, request])),
    [state.requests],
  );
  const pendingSelfOrderTableIds = useMemo(
    () => new Set(pendingSelfOrderRequestByTable.keys()),
    [pendingSelfOrderRequestByTable],
  );
  const staffCallByTable = useMemo(
    () =>
      new Map(
        (state.staffCalls ?? []).map((call) => [call.tableId, call]),
      ),
    [state.staffCalls],
  );
  const staffCallTableIds = useMemo(
    () => new Set(staffCallByTable.keys()),
    [staffCallByTable],
  );
  const selfOrderTableNumberById = useMemo(
    () => new Map(tables.map((table) => [table.id, table.number])),
    [tables],
  );
  const selfOrderPaymentRequestByOrder = useMemo(
    () =>
      new Map(
        state.paymentRequests.map((request) => [request.orderId, request]),
      ),
    [state.paymentRequests],
  );
  const paymentCallByOrderId = useMemo(
    () =>
      new Map(
        state.paymentRequests.map((request) => [request.orderId, request.kind]),
      ),
    [state.paymentRequests],
  );

  return {
    state,
    syncFailed,
    actionVisible,
    approvalOpen,
    selectedRequestId,
    setApprovalOpen,
    setSelectedRequestId,
    refresh,
    refreshWorkflow,
    handleOpenApproval,
    openApprovalForRequest,
    pendingSelfOrderRequestByTable,
    pendingSelfOrderTableIds,
    staffCallByTable,
    staffCallTableIds,
    selfOrderTableNumberById,
    selfOrderPaymentRequestByOrder,
    paymentCallByOrderId,
  };
}
