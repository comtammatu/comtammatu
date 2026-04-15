"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  readBlockedStateFromSearchParams,
  type ResolvedBlockedState,
} from "@comtammatu/shared/auth";
import { cn } from "@comtammatu/ui";

type BlockedStateFlashMode = "inline" | "toast" | "toast-inline";

const TONE_STYLES = {
  neutral: {
    container:
      "border-border/70 bg-muted/45 text-foreground shadow-sm shadow-black/5",
    icon: "bg-muted text-muted-foreground",
    eyebrow: "text-muted-foreground/80",
    body: "text-muted-foreground",
    nextStep: "text-muted-foreground/90",
  },
  warning: {
    container:
      "border-amber-200 bg-amber-50/90 text-amber-950 shadow-sm shadow-amber-200/30",
    icon: "bg-amber-100 text-amber-700",
    eyebrow: "text-amber-700/80",
    body: "text-amber-900/80",
    nextStep: "text-amber-900/75",
  },
  danger: {
    container:
      "border-destructive/20 bg-destructive/8 text-foreground shadow-sm shadow-destructive/10",
    icon: "bg-destructive/12 text-destructive",
    eyebrow: "text-destructive/80",
    body: "text-foreground/80",
    nextStep: "text-foreground/75",
  },
} as const;

const TONE_TO_TOAST = {
  neutral: toast.info,
  warning: toast.warning,
  danger: toast.error,
} as const;

const TONE_TO_A11Y = {
  neutral: {
    role: "status",
    ariaLive: "polite",
  },
  warning: {
    role: "status",
    ariaLive: "polite",
  },
  danger: {
    role: "alert",
    ariaLive: "assertive",
  },
} as const;

export function SearchParamBlockedStateFlash({
  mode = "inline",
  autoClear = false,
  className,
}: {
  mode?: BlockedStateFlashMode;
  autoClear?: boolean;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const blockedState = readBlockedStateFromSearchParams(searchParams);
  const blockedStateKey =
    searchParams.get("forbidden") === "1"
      ? `${pathname}:${searchParams.get("reason") ?? "generic"}`
      : null;
  const handledKeyRef = useRef<string | null>(null);
  const [persistedBlockedState, setPersistedBlockedState] =
    useState<ResolvedBlockedState | null>(blockedState);

  useEffect(() => {
    if (!blockedState || !blockedStateKey || handledKeyRef.current === blockedStateKey) {
      return;
    }

    handledKeyRef.current = blockedStateKey;

    if (mode !== "toast") {
      setPersistedBlockedState(blockedState);
    }

    if (mode === "toast" || mode === "toast-inline") {
      const showToast =
        TONE_TO_TOAST[blockedState.copy.tone] ?? TONE_TO_TOAST.warning;
      showToast(blockedState.copy.toastMessage);
    }

    if (autoClear) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("forbidden");
      params.delete("reason");
      const queryString = params.toString();
      router.replace(pathname + (queryString ? `?${queryString}` : ""), {
        scroll: false,
      });
    }
  }, [
    autoClear,
    blockedState,
    blockedStateKey,
    mode,
    pathname,
    router,
    searchParams,
  ]);

  const visibleBlockedState =
    mode === "toast" ? null : persistedBlockedState ?? blockedState;

  if (!visibleBlockedState) {
    return null;
  }

  const toneStyle =
    TONE_STYLES[visibleBlockedState.copy.tone] ?? TONE_STYLES.warning;
  const accessibilityTone =
    TONE_TO_A11Y[visibleBlockedState.copy.tone] ?? TONE_TO_A11Y.warning;

  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3",
        toneStyle.container,
        className,
      )}
      aria-atomic="true"
      aria-live={accessibilityTone.ariaLive}
      role={accessibilityTone.role}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
            toneStyle.icon,
          )}
        >
          <AlertTriangle className="size-4.5" />
        </div>
        <div className="min-w-0 space-y-1">
          <p
            className={cn(
              "text-xs font-semibold uppercase tracking-widest",
              toneStyle.eyebrow,
            )}
          >
            Truy cập bị chặn
          </p>
          <p className="text-sm font-semibold">{visibleBlockedState.copy.title}</p>
          <p className={cn("text-sm leading-6", toneStyle.body)}>
            {visibleBlockedState.copy.description}
          </p>
          <p className={cn("text-sm leading-6", toneStyle.nextStep)}>
            {visibleBlockedState.copy.nextStep}
          </p>
        </div>
      </div>
    </div>
  );
}
