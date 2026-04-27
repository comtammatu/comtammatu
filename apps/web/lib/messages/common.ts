import { ACTIONS_VI, ERRORS_VI, STATES_VI } from "@comtammatu/shared/messages"

export const common = {
  errorFallback: ERRORS_VI.fallback,
  saved: STATES_VI.saved,
  created: STATES_VI.created,
  updated: STATES_VI.updated,
  deleted: STATES_VI.deleted,
  confirmTitle: ACTIONS_VI.confirm,
  confirmCancel: ACTIONS_VI.cancel,
  confirmOk: ACTIONS_VI.confirm,
  sessionExpired: ERRORS_VI.sessionExpired,
  forbidden: ERRORS_VI.forbidden,
  networkError: ERRORS_VI.networkError,
} as const
