export const RATING_MIN = 1;
export const RATING_MAX = 5;
/** Rating at or below this threshold triggers realtime Telegram alert */
export const TELEGRAM_THRESHOLD_RATING = 3;

export const COMMENT_MIN_LENGTH = 10;
export const COMMENT_MAX_LENGTH = 2000;

export const PHONE_MIN_LENGTH = 8;
export const PHONE_MAX_LENGTH = 15;
export const PHONE_REGEX = /^\+?\d{8,15}$/;

export const TOKEN_LENGTH = 14;
export const TOKEN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export const PHOTO_MAX_COUNT = 3;
/** 5 MB per photo — enforced in Slice 3 */
export const PHOTO_MAX_SIZE_BYTES = 5 * 1024 * 1024;

export const OUTBOX_MAX_ATTEMPTS = 5;
/** Indexed by attempt number (0-based); value = minutes to wait before retry */
export const OUTBOX_BACKOFF_MINUTES = [1, 2, 4, 8, 16] as const;

export const RATE_LIMIT_TOKEN_PER_30MIN = 5;
export const RATE_LIMIT_IP_PER_30MIN = 20;

export const QR_LABEL_MAX_LENGTH = 200;
export const TELEGRAM_DEST_LABEL_MAX_LENGTH = 100;
export const TELEGRAM_CHAT_ID_MAX_LENGTH = 64;

/**
 * Taxonomy of 25 feedback categories.
 * MUST match 100% with DB function `feedback_validate_categories`.
 */
export const FEEDBACK_CATEGORIES = [
  "food.quality.cold",
  "food.quality.raw",
  "food.quality.spoiled",
  "food.quality.taste",
  "food.quality.portion",
  "service.slow",
  "service.attitude",
  "service.wrong_order",
  "service.missing_item",
  "hygiene.dirty_table",
  "hygiene.bug",
  "hygiene.smell",
  "hygiene.toilet",
  "pricing.overcharged",
  "pricing.unclear",
  "ambience.noise",
  "ambience.crowded",
  "ambience.aircon",
  "ambience.parking",
  "praise.food",
  "praise.service",
  "praise.value",
  "suggestion.menu",
  "suggestion.facility",
  "other",
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
