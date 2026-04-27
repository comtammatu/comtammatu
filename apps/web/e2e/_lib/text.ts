// Re-exports of canonical Vietnamese copy for Playwright e2e selectors.
//
// Tests reference TEXT.ACTIONS_VI.cancel instead of literal "Hủy" so copy
// migrations (Phase 2 sweep) stay in sync with the test suite.
// See tasks/regressions.md E2E-TEXT-FROM-DICTIONARY (2026-04-27).
//
// Usage:
//   import * as TEXT from "../_lib/text"
//   await page.getByRole("button", { name: TEXT.ACTIONS_VI.cancel }).click()
//   await expect(page.getByText(TEXT.STATES_VI.saved)).toBeVisible()
export {
  ACTIONS_VI,
  STATES_VI,
  ERRORS_VI,
  ORDER_VI,
  BRANCH_VI,
  STAFF_VI,
  TABLE_VI,
  PRODUCT_VI,
  CUSTOMER_VI,
  interpolate,
} from "@comtammatu/shared/messages";
