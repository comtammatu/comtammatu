"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type TransitionStartFunction,
} from "react";
import { toast } from "@comtammatu/ui/components/sonner";
import { fetchActiveOrderForTable } from "../actions";
import {
  acknowledgeSelfOrderStaffCall,
  type SelfOrderPendingPaymentRequest,
  type SelfOrderPendingRequest,
  type SelfOrderPendingStaffCall,
} from "../self-order-actions";
import type { BranchTable } from "../page";
import type { OrderDetailData } from "../order-detail-sheet";
import {
  ACTIVE_POS_STATUSES,
  compareOrdersByNextAction,
  type SessionOrder,
} from "../order-history";
import {
  isActiveUnpaidPosOrder,
  isPosOrderAmountLocked,
} from "../_lib/table-order-visual-state";
import { confirmAndCancelPendingPayment } from "../_lib/confirm-cancel-pending-payment";
import type { OrderType } from "../types";

export interface UsePosFloorSelectArgs {
  branchId: number;
  orders: SessionOrder[];
  tables: BranchTable[];
  cartOrderType: OrderType;
  selectedTableId: number | null;
  selectedTable: BranchTable | null;
  setActiveTable: (tableId: number | null) => void;
  setCartDrawerOpen: (open: boolean) => void;
  setShowOrders: (open: boolean) => void;
  startTransition: TransitionStartFunction;
  focusOrderWorkflow: (orderId: number, orderNumber?: string | null) => void;
  openBill: (orderId: number, intent?: "payment" | "receipt") => void;
  openApprovalForRequest: (requestId: number) => void;
  refreshSelfOrderPosState: () => void;
  refreshOperational: () => void;
  startAppendTarget: (orderId: number, orderNumber: string) => void;
  setOrderDetailSeed: (seed: {
    order: OrderDetailData;
    canManage: boolean;
    canCancelOrder: boolean;
  } | null) => void;
  staffCallByTable: ReadonlyMap<number, SelfOrderPendingStaffCall>;
  pendingSelfOrderRequestByTable: ReadonlyMap<number, SelfOrderPendingRequest>;
  selfOrderPaymentRequestByOrder: ReadonlyMap<
    number,
    SelfOrderPendingPaymentRequest
  >;
}

export function usePosFloorSelect({
  branchId,
  orders,
  tables,
  cartOrderType,
  selectedTableId,
  selectedTable,
  setActiveTable,
  setCartDrawerOpen,
  setShowOrders,
  startTransition,
  focusOrderWorkflow,
  openBill,
  openApprovalForRequest,
  refreshSelfOrderPosState,
  refreshOperational,
  startAppendTarget,
  setOrderDetailSeed,
  staffCallByTable,
  pendingSelfOrderRequestByTable,
  selfOrderPaymentRequestByOrder,
}: UsePosFloorSelectArgs) {
  const [pickerTableId, setPickerTableId] = useState<number | null>(null);
  const [allowOccupiedTableId, setAllowOccupiedTableId] = useState<
    number | null
  >(null);

  useEffect(() => {
    if (
      cartOrderType === "dine_in" &&
      selectedTableId !== null &&
      selectedTable != null &&
      selectedTable.status !== "available" &&
      selectedTableId !== allowOccupiedTableId
    ) {
      setActiveTable(null);
    }
  }, [
    allowOccupiedTableId,
    cartOrderType,
    selectedTable,
    selectedTableId,
    setActiveTable,
  ]);

  useEffect(() => {
    if (
      allowOccupiedTableId !== null &&
      selectedTableId !== allowOccupiedTableId
    ) {
      setAllowOccupiedTableId(null);
    }
  }, [allowOccupiedTableId, selectedTableId]);

  const pickerTable = useMemo(
    () =>
      pickerTableId !== null
        ? (tables.find((t) => t.id === pickerTableId) ?? null)
        : null,
    [pickerTableId, tables],
  );

  const pickerOrders = useMemo(
    () =>
      pickerTableId !== null
        ? orders
            .filter(
              (o) =>
                o.table_id === pickerTableId &&
                isActiveUnpaidPosOrder(o, ACTIVE_POS_STATUSES),
            )
            .sort(compareOrdersByNextAction)
        : [],
    [pickerTableId, orders],
  );

  useEffect(() => {
    if (pickerTableId !== null && pickerOrders.length === 0) {
      setPickerTableId(null);
    }
  }, [pickerTableId, pickerOrders.length]);

  const handleTableSelect = useCallback(
    (table: BranchTable) => {
      const staffCall = staffCallByTable.get(table.id);
      if (staffCall) {
        void acknowledgeSelfOrderStaffCall({ callId: staffCall.id }).then(
          () => {
            void refreshSelfOrderPosState();
          },
        );
      }
      const pendingSelfOrderRequest = pendingSelfOrderRequestByTable.get(
        table.id,
      );
      if (pendingSelfOrderRequest) {
        openApprovalForRequest(pendingSelfOrderRequest.id);
        return;
      }

      if (table.status === "available") {
        setActiveTable(selectedTableId === table.id ? null : table.id);
        return;
      }

      if (table.status !== "occupied") {
        toast.message("Bàn này chưa sẵn sàng để nhận đơn.");
        return;
      }

      const activeOrders = orders.filter(
        (o) =>
          o.table_id === table.id &&
          isActiveUnpaidPosOrder(o, ACTIVE_POS_STATUSES),
      );
      const paymentCallOrders = activeOrders.filter((order) =>
        selfOrderPaymentRequestByOrder.has(order.id),
      );
      if (paymentCallOrders.length === 1) {
        const paymentCallOrder = paymentCallOrders[0];
        if (paymentCallOrder) {
          openBill(paymentCallOrder.id, "payment");
          return;
        }
      }

      if (activeOrders.length === 1) {
        const order = activeOrders[0];
        if (order) {
          focusOrderWorkflow(order.id, order.order_number);
          return;
        }
      }

      if (activeOrders.length === 0) {
        startTransition(async () => {
          const result = await fetchActiveOrderForTable(branchId, table.id);
          if (result.success && result.data) {
            const order = result.data.order as unknown as OrderDetailData;
            setOrderDetailSeed({
              order,
              canManage: result.data.canManageOrders,
              canCancelOrder: result.data.canCancelOrder,
            });
            focusOrderWorkflow(order.id, order.order_number);
            void refreshOperational();
            return;
          }
          toast.error(
            result.error ?? "Chưa tìm thấy đơn đang phục vụ của bàn này.",
          );
          void refreshOperational();
        });
        return;
      }

      setPickerTableId(table.id);
    },
    [
      branchId,
      focusOrderWorkflow,
      openApprovalForRequest,
      orders,
      openBill,
      pendingSelfOrderRequestByTable,
      refreshOperational,
      refreshSelfOrderPosState,
      selfOrderPaymentRequestByOrder,
      staffCallByTable,
      selectedTableId,
      setActiveTable,
      setOrderDetailSeed,
      startTransition,
    ],
  );

  const handleClosePicker = useCallback(() => {
    setPickerTableId(null);
  }, []);

  const handleOpenOrderFromPicker = useCallback(
    (orderId: number, orderNumber: string) => {
      setPickerTableId(null);
      focusOrderWorkflow(orderId, orderNumber);
    },
    [focusOrderWorkflow],
  );

  const handlePayOrderFromPicker = useCallback(
    (orderId: number) => {
      setPickerTableId(null);
      openBill(orderId, "payment");
    },
    [openBill],
  );

  const handleAppendOrderFromPicker = useCallback(
    (orderId: number, orderNumber: string) => {
      const order = orders.find((row) => row.id === orderId);
      const locked = order != null && isPosOrderAmountLocked(order);
      void (async () => {
        const ok = await confirmAndCancelPendingPayment({
          branchId,
          orderId,
          locked,
        });
        if (!ok) return;
        setPickerTableId(null);
        setCartDrawerOpen(false);
        startAppendTarget(orderId, orderNumber);
        setShowOrders(false);
        toast.message("Chạm món trên menu để thêm");
        if (locked) void refreshOperational();
      })();
    },
    [
      branchId,
      orders,
      refreshOperational,
      setCartDrawerOpen,
      setShowOrders,
      startAppendTarget,
    ],
  );

  const handleCreateNewOnOccupied = useCallback(() => {
    if (pickerTableId === null) return;
    const tableId = pickerTableId;
    setPickerTableId(null);
    setAllowOccupiedTableId(tableId);
    setActiveTable(tableId);
    setCartDrawerOpen(false);
  }, [pickerTableId, setActiveTable, setCartDrawerOpen]);

  const handleCreateOrderOnTable = useCallback(
    (tableId: number) => {
      setAllowOccupiedTableId(tableId);
      setActiveTable(tableId);
      setCartDrawerOpen(false);
    },
    [setActiveTable, setCartDrawerOpen],
  );

  return {
    pickerTableId,
    pickerTable,
    pickerOrders,
    allowOccupiedTableId,
    handleTableSelect,
    handleClosePicker,
    handleOpenOrderFromPicker,
    handlePayOrderFromPicker,
    handleAppendOrderFromPicker,
    handleCreateNewOnOccupied,
    handleCreateOrderOnTable,
  };
}
