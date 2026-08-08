"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

export type OverlayHistoryMethod = "push" | "replace";

export type DocumentOverlayPatch = Record<
  string,
  string | number | null | undefined
>;

function readSearchParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function applyPatch(
  params: URLSearchParams,
  patch: DocumentOverlayPatch,
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "") next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}

function writeUrl(
  pathname: string,
  params: URLSearchParams,
  method: OverlayHistoryMethod,
) {
  const q = params.toString();
  const nextUrl = `${pathname}${q ? `?${q}` : ""}${window.location.hash}`;
  if (method === "push") window.history.pushState(null, "", nextUrl);
  else window.history.replaceState(null, "", nextUrl);
  // pushState/replaceState do not emit popstate; notify overlay listeners.
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Build a shareable href for deep links (full navigation when pathname differs). */
export function buildOverlayHref(
  pathname: string,
  currentSearch: string | URLSearchParams,
  patch: DocumentOverlayPatch,
): string {
  const base =
    typeof currentSearch === "string"
      ? new URLSearchParams(currentSearch)
      : new URLSearchParams(currentSearch.toString());
  const next = applyPatch(base, patch);
  const q = next.toString();
  return `${pathname}${q ? `?${q}` : ""}`;
}

function snapshotKeys(
  params: URLSearchParams,
  keys: readonly string[],
): Record<string, string | null> {
  const snapshot: Record<string, string | null> = {};
  for (const key of keys) {
    snapshot[key] = params.get(key);
  }
  return snapshot;
}

/**
 * Addressable document-dialog URL without App Router RSC refetch.
 * Row open uses push; mode changes and close use replace (ADR 0018).
 * Scope keys (branchId, server filters) must keep using router.* separately.
 */
export function useDocumentOverlayUrl(keys: readonly string[]) {
  const pathname = usePathname();
  const keySig = keys.join("\0");
  const keyList = useMemo(() => keySig.split("\0").filter(Boolean), [keySig]);
  const [values, setValues] = useState<Record<string, string | null>>(() =>
    snapshotKeys(readSearchParams(), keys),
  );

  const syncFromLocation = useCallback(() => {
    setValues(snapshotKeys(readSearchParams(), keyList));
  }, [keyList]);

  useEffect(() => {
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, [syncFromLocation]);

  const patchOverlay = useCallback(
    (patch: DocumentOverlayPatch, method: OverlayHistoryMethod = "replace") => {
      const next = applyPatch(readSearchParams(), patch);
      writeUrl(pathname, next, method);
      setValues(snapshotKeys(next, keyList));
    },
    [keyList, pathname],
  );

  const clearOverlay = useCallback(
    (
      clearKeys: readonly string[] = keyList,
      method: OverlayHistoryMethod = "replace",
    ) => {
      const patch: DocumentOverlayPatch = {};
      for (const key of clearKeys) patch[key] = null;
      patchOverlay(patch, method);
    },
    [keyList, patchOverlay],
  );

  const get = useCallback((key: string) => values[key] ?? null, [values]);

  return useMemo(
    () => ({
      values,
      get,
      patchOverlay,
      clearOverlay,
      pathname,
    }),
    [values, get, patchOverlay, clearOverlay, pathname],
  );
}
