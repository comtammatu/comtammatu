export type RelayCreateOrderError = {
  message?: string | null;
};

export type RelayCreateOrderFailure = {
  status: 422 | 500;
  code: string;
  message: string;
};

const GENERIC_FAILURE: RelayCreateOrderFailure = {
  status: 500,
  code: "create_order_failed",
  message: "Không thể tạo đơn hàng trên POS",
};

export function mapRelayCreateOrderRpcError(
  error: RelayCreateOrderError,
  channelPriceMessage: string,
): RelayCreateOrderFailure {
  const message = error.message?.toLowerCase() ?? "";

  if (message.includes("daily_limit_item_disabled")) {
    return {
      status: 422,
      code: "daily_limit_item_disabled",
      message: "Có món đã bị tắt bán trong ngày — cần xử lý đơn thủ công",
    };
  }

  if (message.includes("daily_limit_exceeded")) {
    return {
      status: 422,
      code: "daily_limit_exceeded",
      message: "Có món đã hết suất hôm nay — cần xử lý đơn thủ công",
    };
  }

  if (message.includes("channel_price_missing")) {
    return {
      status: 422,
      code: "channel_price_missing",
      message: channelPriceMessage,
    };
  }

  if (message.includes("stale_side_or_modifier")) {
    return {
      status: 422,
      code: "stale_side_or_modifier",
      message: "Món thêm trên phiếu không còn trên thực đơn — cần xử lý đơn thủ công",
    };
  }

  if (message.includes("discount_invalid_type")) {
    return {
      status: 422,
      code: "discount_invalid_type",
      message: "Khuyến mãi trên phiếu không áp được vào POS — cần xử lý đơn thủ công",
    };
  }

  if (message.includes("insufficient_stock")) {
    return {
      status: 422,
      code: "insufficient_stock",
      message: "Không đủ tồn kho cho món trên phiếu — cần xử lý đơn thủ công",
    };
  }

  return GENERIC_FAILURE;
}
