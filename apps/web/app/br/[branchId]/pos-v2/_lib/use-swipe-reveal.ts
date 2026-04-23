"use client";

import { useCallback, useRef, useState } from "react";
import type { PointerEvent } from "react";

export type SwipeDirection = "left" | "right";

interface UseSwipeRevealOptions {
  direction: SwipeDirection;
  threshold?: number;
  revealWidth?: number;
  disabled?: boolean;
  /** Vertical slop to abort swipe (treat as scroll instead). */
  verticalAbortPx?: number;
}

interface UseSwipeRevealResult {
  offset: number;
  revealed: boolean;
  isDragging: boolean;
  close: () => void;
  handlers: {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
  };
}

/**
 * Swipe-to-reveal. Horizontal drag exposes an action slot on one side; tapping
 * the slot commits the action. Vertical drags abort so scroll still works.
 */
export function useSwipeReveal({
  direction,
  threshold = 56,
  revealWidth = 96,
  disabled = false,
  verticalAbortPx = 16,
}: UseSwipeRevealOptions): UseSwipeRevealResult {
  const [offset, setOffset] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const aborted = useRef(false);
  const baseOffset = useRef(0);
  const sign = direction === "left" ? -1 : 1;

  const reset = useCallback((keepRevealed = false) => {
    setOffset(keepRevealed ? sign * revealWidth : 0);
    setRevealed(keepRevealed);
    setIsDragging(false);
    startX.current = null;
    startY.current = null;
    aborted.current = false;
    baseOffset.current = keepRevealed ? sign * revealWidth : 0;
  }, [revealWidth, sign]);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (disabled) return;
      startX.current = e.clientX;
      startY.current = e.clientY;
      aborted.current = false;
      baseOffset.current = revealed ? sign * revealWidth : 0;
      setIsDragging(false);
    },
    [disabled, revealed, revealWidth, sign],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (disabled || aborted.current) return;
      if (startX.current == null || startY.current == null) return;

      const dx = e.clientX - startX.current;
      const dy = e.clientY - startY.current;

      if (!isDragging) {
        if (Math.abs(dy) > verticalAbortPx && Math.abs(dy) > Math.abs(dx)) {
          aborted.current = true;
          setOffset(baseOffset.current);
          return;
        }
        if (Math.abs(dx) < 6) return;
        setIsDragging(true);
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      }

      const projected = baseOffset.current + dx;
      const clamped =
        sign === -1
          ? Math.max(-revealWidth, Math.min(0, projected))
          : Math.min(revealWidth, Math.max(0, projected));
      setOffset(clamped);
    },
    [disabled, isDragging, revealWidth, sign, verticalAbortPx],
  );

  const onPointerUp = useCallback(() => {
    if (disabled) return;
    if (aborted.current || !isDragging) {
      reset(revealed);
      return;
    }
    const abs = Math.abs(offset);
    if (abs >= threshold) {
      reset(true);
    } else {
      reset(false);
    }
  }, [disabled, isDragging, offset, reset, revealed, threshold]);

  const close = useCallback(() => reset(false), [reset]);

  return {
    offset,
    revealed,
    isDragging,
    close,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
