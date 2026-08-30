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

  return GENERIC_FAILURE;
}
