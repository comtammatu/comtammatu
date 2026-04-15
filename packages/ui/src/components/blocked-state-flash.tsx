"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Card,
  CardContent,
} from "@comtammatu/ui/components/card";

export type BlockedStateTone = "neutral" | "warning" | "danger";

export interface BlockedStateCopy {
  tone: BlockedStateTone;
  title: string;
  description: string;
  nextStep: string;
  toastMessage: string;
}

export interface ResolvedBlockedState {
  copy: BlockedStateCopy;
}

type BlockedStateFlashMode = "inline" | "toast" | "toast-inline";

const TONE_VARIANTS = {
  neutral: {
    icon: "bg-muted text-muted-foreground",
    badge: "secondary",
  },
  warning: {
    icon: "bg-warning/10 text-warning",
    badge: "warning",
  },
  danger: {
    icon: "bg-destructive/10 text-destructive",
    badge: "destructive",
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
  blockedState,
  blockedStateKey,
  onAutoClear,
}: {
  mode?: BlockedStateFlashMode;
  autoClear?: boolean;
  className?: string;
  blockedState: ResolvedBlockedState | null;
  blockedStateKey: string | null;
  onAutoClear?: () => void;
}) {
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
      onAutoClear?.();
    }
  }, [
    autoClear,
    blockedState,
    blockedStateKey,
    mode,
    onAutoClear,
  ]);

  const visibleBlockedState =
    mode === "toast" ? null : persistedBlockedState ?? blockedState;

  if (!visibleBlockedState) {
    return null;
  }

  const toneStyle =
    TONE_VARIANTS[visibleBlockedState.copy.tone] ??
    TONE_VARIANTS.warning;
  const accessibilityTone =
    TONE_TO_A11Y[visibleBlockedState.copy.tone] ?? TONE_TO_A11Y.warning;

  return (
    <Card
      className={cn(
        className,
      )}
      aria-atomic="true"
      aria-live={accessibilityTone.ariaLive}
      role={accessibilityTone.role}
    >
      <CardContent className="flex items-start gap-3">
        <Badge
          variant={toneStyle.badge}
          className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full", toneStyle.icon)}
        >
          <AlertTriangle className="size-4.5" />
        </Badge>
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Truy cập bị chặn
          </p>
          <p className="text-sm font-semibold">{visibleBlockedState.copy.title}</p>
          <p className="text-sm leading-6 text-muted-foreground">
            {visibleBlockedState.copy.description}
          </p>
          <p className="text-sm leading-6 text-muted-foreground/90">
            {visibleBlockedState.copy.nextStep}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
