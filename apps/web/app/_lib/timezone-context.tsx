"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_TENANT_TIMEZONE } from "@comtammatu/shared/datetime";

const TimezoneContext = createContext<string>(DEFAULT_TENANT_TIMEZONE);

export function TimezoneProvider({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return (
    <TimezoneContext.Provider value={value}>
      {children}
    </TimezoneContext.Provider>
  );
}

/**
 * Returns the tenant IANA timezone (e.g. "Asia/Ho_Chi_Minh"). Always returns
 * a string — never falls through to the host clock. Pair with helpers from
 * `@comtammatu/shared/datetime` to format timestamps deterministically across
 * SSR, browser, and machines whose system timezone is misconfigured.
 */
export function useTenantTimezone(): string {
  return useContext(TimezoneContext);
}
