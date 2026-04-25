/**
 * Pure types + helpers for the user-drafts strip. NO server imports — safe
 * to consume from `"use client"` components like `<UserDraftsStrip>` and the
 * inventory shell. The server loader (`loadUserDrafts`) lives in
 * `user-drafts.ts` and pulls in auth + Supabase, which would break the
 * client boundary if dragged through here.
 */

export interface UserDrafts {
  po: number;
  grn: number;
  transfer: number;
  supplierReturn: number;
  wastePending: number;
  stocktakeOpen: number;
}

export const ZERO_DRAFTS: UserDrafts = {
  po: 0,
  grn: 0,
  transfer: 0,
  supplierReturn: 0,
  wastePending: 0,
  stocktakeOpen: 0,
};

export function userDraftsTotal(drafts: UserDrafts): number {
  return (
    drafts.po +
    drafts.grn +
    drafts.transfer +
    drafts.supplierReturn +
    drafts.wastePending +
    drafts.stocktakeOpen
  );
}
