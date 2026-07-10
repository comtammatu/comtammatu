"use client";

import { memo } from "react";
import { formatCount } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
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
  appendDraftQuantity: number;
  ordersCount: number;
  canSubmitNewOrder: boolean;
  isSubmittingNewOrder: boolean;
  canSubmitAppendDraft: boolean;
  isSubmittingAppendDraft: boolean;
  /** Opens the orders drawer view (refreshes then shows). */
  onOpenOrdersDrawer: () => void;
  /** Opens the cart drawer in its non-orders view. */
  onOpenCartDrawer: () => void;
  /** Opens the append-draft drawer while adding items to an existing order. */
  onOpenAppendDrawer: () => void;
  onSubmitNewOrder: () => void;
  onSubmitAppendDraft: () => void;
  onCancelAppend: () => void;
}

const ACTION_BAR_CLASS =
  "fixed inset-x-3 bottom-0 z-40 flex gap-2 rounded-lg bg-card/95 p-2 shadow-2xl ring-1 ring-border backdrop-blur pos-safe-bottom xl:hidden";

const SESSION_ORDERS_BAR_CLASS =
  "fixed inset-x-3 bottom-0 z-40 flex justify-end pos-safe-bottom xl:hidden";

const ACTION_PRIMARY_BUTTON_CLASS =
  "min-w-14 flex-1 text-sm font-bold sm:text-base";

const ACTION_SECONDARY_BUTTON_CLASS =
  "min-w-14 flex-1 border border-border bg-secondary text-sm font-bold text-secondary-foreground sm:text-base";

const ACTION_CANCEL_BUTTON_CLASS =
  "min-w-14 shrink-0 border border-border px-3 text-sm font-semibold text-muted-foreground sm:text-base";

const SESSION_ORDERS_BUTTON_CLASS =
  "min-w-14 bg-card/95 px-4 text-sm font-bold ring-1 ring-border backdrop-blur sm:text-base";

function PosMobileActionBarComponent({
  isTouchLayout,
  isAppendingToOrder,
  menuContextReady,
  cartQuantity,
  appendDraftQuantity,
  ordersCount,
  canSubmitNewOrder,
  isSubmittingNewOrder,
  canSubmitAppendDraft,
  isSubmittingAppendDraft,
  onOpenOrdersDrawer,
  onOpenCartDrawer,
  onOpenAppendDrawer,
  onSubmitNewOrder,
  onSubmitAppendDraft,
  onCancelAppend,
}: PosMobileActionBarProps) {
  if (!isTouchLayout) return null;

  if (isAppendingToOrder) {
    if (appendDraftQuantity > 0) {
      return (
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
            variant="secondary"
            size="touch-lg"
            className={ACTION_SECONDARY_BUTTON_CLASS}
            onClick={onOpenAppendDrawer}
            aria-label={messages.pos.mobileActionBar.openAppendAria}
          >
            <IconPlus data-icon="inline-start" />
            <span>{messages.pos.mobileActionBar.appendItems}</span>
            <span className="tabular-nums">
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
            <span>{messages.pos.mobileActionBar.submitAppend}</span>
          </Button>
        </div>
      );
    }

    return (
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
      </div>
    );
  }

  // No order context picked yet → the only sticky CTA opens the session's
  // order list. Context gates themselves own "create new" tiles in the viewport.
  if (!menuContextReady) {
    return (
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
      </div>
    );
  }

  return (
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
            <span>{messages.pos.mobileActionBar.newCart}</span>
            <span className="tabular-nums">{formatCount(cartQuantity)}</span>
          </Button>
          <Button
            type="button"
            size="touch-lg"
            className={ACTION_PRIMARY_BUTTON_CLASS}
            disabled={!canSubmitNewOrder || isSubmittingNewOrder}
            onClick={onSubmitNewOrder}
          >
            {isSubmittingNewOrder ? <Spinner data-icon="inline-start" /> : null}
            <span>{messages.pos.mobileActionBar.submitNew}</span>
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
    </div>
  );
}

export const PosMobileActionBar = memo(PosMobileActionBarComponent);
