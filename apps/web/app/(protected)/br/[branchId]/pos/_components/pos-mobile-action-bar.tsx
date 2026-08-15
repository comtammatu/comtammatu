"use client";

import { memo, type ReactNode } from "react";
import { formatCount, formatVND } from "@comtammatu/shared/format";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  BellRing as IconBell,
  Plus as IconPlus,
  Receipt as IconReceipt,
  ShoppingCart as IconShoppingCart,
  X as IconX,
} from "lucide-react";
import { messages } from "@lib/messages";

export interface PosMobileActionBarProps {
  isTouchLayout: boolean;
  isAppendingToOrder: boolean;
  menuContextReady: boolean;
  cartQuantity: number;
  cartTotal?: number;
  appendDraftQuantity: number;
  ordersCount: number;
  canSubmitNewOrder: boolean;
  isSubmittingNewOrder: boolean;
  canSubmitAppendDraft: boolean;
  isSubmittingAppendDraft: boolean;
  selfOrderRequestCount: number;
  selfOrderSyncFailed: boolean;
  /** Opens the orders drawer view (refreshes then shows). */
  onOpenOrdersDrawer: () => void;
  /** Opens the cart drawer in its non-orders view. */
  onOpenCartDrawer: () => void;
  /** Opens the append-draft drawer while adding items to an existing order. */
  onOpenAppendDrawer: () => void;
  onSubmitNewOrder: () => void;
  onSubmitAppendDraft: () => void;
  onCancelAppend: () => void;
  onOpenSelfOrderApproval: () => void;
}

const TOUCH_DOCK_CLASS =
  "pointer-events-none fixed inset-x-3 bottom-0 z-40 flex flex-col gap-2 pos-safe-bottom xl:hidden";

const ACTION_BAR_SURFACE_CLASS =
  "pointer-events-auto rounded-lg bg-card/95 p-2 shadow-2xl ring-1 ring-border backdrop-blur";

const ACTION_BAR_CLASS = `${ACTION_BAR_SURFACE_CLASS} flex gap-2`;

const APPEND_ACTION_BAR_CLASS = `${ACTION_BAR_SURFACE_CLASS} grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-2`;

const SESSION_ORDERS_BAR_CLASS = "pointer-events-auto flex justify-end";

const SELF_ORDER_BUTTON_CLASS =
  "pointer-events-auto self-end bg-card/95 ring-1 ring-border backdrop-blur";

const ACTION_PRIMARY_BUTTON_CLASS =
  "min-w-0 flex-1 px-2 text-sm font-bold sm:min-w-14 sm:px-4 sm:text-base";

const ACTION_SECONDARY_BUTTON_CLASS =
  "min-w-0 flex-1 border border-border bg-secondary px-2 text-sm font-bold text-secondary-foreground sm:min-w-14 sm:px-4 sm:text-base";

const ACTION_CANCEL_BUTTON_CLASS =
  "w-12 min-w-12 shrink-0 border border-border px-0 text-sm font-semibold text-muted-foreground sm:w-auto sm:min-w-14 sm:px-3 sm:text-base";

const SESSION_ORDERS_BUTTON_CLASS =
  "min-w-14 bg-card/95 px-4 text-sm font-bold ring-1 ring-border backdrop-blur sm:text-base";

function PosMobileActionBarComponent({
  isTouchLayout,
  isAppendingToOrder,
  menuContextReady,
  cartQuantity,
  cartTotal = 0,
  appendDraftQuantity,
  ordersCount,
  canSubmitNewOrder,
  isSubmittingNewOrder,
  canSubmitAppendDraft,
  isSubmittingAppendDraft,
  selfOrderRequestCount,
  selfOrderSyncFailed,
  onOpenOrdersDrawer,
  onOpenCartDrawer,
  onOpenAppendDrawer,
  onSubmitNewOrder,
  onSubmitAppendDraft,
  onCancelAppend,
  onOpenSelfOrderApproval,
}: PosMobileActionBarProps) {
  if (!isTouchLayout) return null;

  const showSelfOrderAction = selfOrderSyncFailed || selfOrderRequestCount > 0;
  const retrySelfOrderOnly = selfOrderSyncFailed && selfOrderRequestCount === 0;
  const renderTouchDock = (actionRow: ReactNode) => (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-[env(safe-area-inset-bottom)] bg-card/95 xl:hidden"
      />
      <div className={TOUCH_DOCK_CLASS}>
        {showSelfOrderAction ? (
          <Button
            type="button"
            variant="outline"
            size="touch"
            className={SELF_ORDER_BUTTON_CLASS}
            onClick={onOpenSelfOrderApproval}
            aria-label={
              retrySelfOrderOnly ? messages.pos.selfOrderSync.retry : undefined
            }
          >
            <IconBell data-icon="inline-start" />
            <span className="truncate">
              {retrySelfOrderOnly
                ? messages.pos.selfOrderSync.failed
                : SELF_ORDER_VI.staffApprove}
            </span>
            {selfOrderRequestCount > 0 ? (
              <Badge variant="warning">
                {formatCount(selfOrderRequestCount)}
              </Badge>
            ) : null}
          </Button>
        ) : null}
        {actionRow}
      </div>
    </>
  );

  if (isAppendingToOrder) {
    if (appendDraftQuantity > 0) {
      return renderTouchDock(
        <div className={APPEND_ACTION_BAR_CLASS}>
          <Button
            type="button"
            variant="outline"
            size="touch-lg"
            className={ACTION_CANCEL_BUTTON_CLASS}
            onClick={onCancelAppend}
            aria-label={messages.pos.appendDraft.cancelAria}
          >
            <IconX data-icon="inline-start" />
            <span className="hidden sm:inline">
              {messages.pos.appendDraft.cancel}
            </span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="touch-lg"
            className={ACTION_SECONDARY_BUTTON_CLASS}
            onClick={onOpenAppendDrawer}
            aria-label={messages.pos.mobileActionBar.openAppendAria}
          >
            <IconPlus data-icon="inline-start" />
            <span className="min-w-0 truncate">
              {messages.pos.mobileActionBar.appendItems}
            </span>
            <span className="shrink-0 tabular-nums">
              {formatCount(appendDraftQuantity)}
            </span>
          </Button>
          <Button
            type="button"
            size="touch-lg"
            className={ACTION_PRIMARY_BUTTON_CLASS}
            disabled={!canSubmitAppendDraft || isSubmittingAppendDraft}
            onClick={onSubmitAppendDraft}
          >
            {isSubmittingAppendDraft ? (
              <Spinner data-icon="inline-start" />
            ) : null}
            <span className="truncate">
              {messages.pos.mobileActionBar.submitAppend}
            </span>
          </Button>
        </div>,
      );
    }

    return renderTouchDock(
      <div className={ACTION_BAR_CLASS}>
        <Button
          type="button"
          variant="outline"
          size="touch-lg"
          className={ACTION_CANCEL_BUTTON_CLASS}
          onClick={onCancelAppend}
          aria-label={messages.pos.appendDraft.cancelAria}
        >
          <IconX data-icon="inline-start" />
          <span>{messages.pos.appendDraft.cancel}</span>
        </Button>
        <Button
          type="button"
          size="touch-lg"
          className={ACTION_PRIMARY_BUTTON_CLASS}
          onClick={onOpenAppendDrawer}
          aria-label={messages.pos.mobileActionBar.openAppendAria}
        >
          <IconPlus data-icon="inline-start" />
          <span>{messages.pos.mobileActionBar.appendItems}</span>
          {appendDraftQuantity > 0 && (
            <span className="tabular-nums">
              {formatCount(appendDraftQuantity)}
            </span>
          )}
        </Button>
      </div>,
    );
  }

  // No order context picked yet → the primary dock row opens the session's
  // order list. Context gates themselves own "create new" tiles in the viewport.
  if (!menuContextReady) {
    return renderTouchDock(
      <div className={SESSION_ORDERS_BAR_CLASS}>
        <Button
          type="button"
          variant="outline"
          size="touch-lg"
          className={SESSION_ORDERS_BUTTON_CLASS}
          onClick={onOpenOrdersDrawer}
          aria-label={messages.pos.mobileActionBar.sessionOrders}
        >
          <IconReceipt data-icon="inline-start" />
          <span>{messages.pos.mobileActionBar.sessionOrders}</span>
          {ordersCount > 0 && (
            <span className="tabular-nums">{formatCount(ordersCount)}</span>
          )}
        </Button>
      </div>,
    );
  }

  return renderTouchDock(
    <div className={ACTION_BAR_CLASS}>
      {cartQuantity > 0 ? (
        <>
          <Button
            type="button"
            variant="secondary"
            size="touch-lg"
            className={ACTION_SECONDARY_BUTTON_CLASS}
            onClick={onOpenCartDrawer}
            aria-label={messages.pos.mobileActionBar.openNewCartAria}
          >
            <IconShoppingCart data-icon="inline-start" />
            <span className="min-w-0 truncate">
              {messages.pos.mobileActionBar.newCart} ({formatCount(cartQuantity)})
            </span>
            {cartTotal > 0 ? (
              <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-primary sm:text-sm">
                {formatVND(cartTotal)}
              </span>
            ) : null}
          </Button>
          <Button
            type="button"
            size="touch-lg"
            className={ACTION_PRIMARY_BUTTON_CLASS}
            disabled={!canSubmitNewOrder || isSubmittingNewOrder}
            onClick={onSubmitNewOrder}
          >
            {isSubmittingNewOrder ? <Spinner data-icon="inline-start" /> : null}
            <span className="truncate">
              {messages.pos.mobileActionBar.submitNew}
            </span>
          </Button>
        </>
      ) : (
        <Button
          type="button"
          size="touch-lg"
          className={ACTION_PRIMARY_BUTTON_CLASS}
          onClick={onOpenCartDrawer}
          aria-label={messages.pos.mobileActionBar.openNewCartAria}
        >
          <IconShoppingCart data-icon="inline-start" />
          <span>{messages.pos.mobileActionBar.newCart}</span>
        </Button>
      )}
    </div>,
  );
}

export const PosMobileActionBar = memo(PosMobileActionBarComponent);
