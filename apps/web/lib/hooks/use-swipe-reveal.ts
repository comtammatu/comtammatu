"use client";

import { useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

interface UseSwipeRevealOptions {
  revealWidth: number;
  activationPx?: number;
  threshold?: number;
}

interface SwipeState {
  key: string;
  pointerId: number;
  startX: number;
  startY: number;
  startOffset: number;
  offset: number;
  dragging: boolean;
}

export interface SwipeReveal {
  revealedKey: string | null;
  setRevealedKey: (key: string | null) => void;
  isRevealed: (key: string) => boolean;
  clearReveal: () => void;
  consumeSuppression: (key: string) => boolean;
  bindings: (key: string) => {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  };
}

export function useSwipeReveal({
  revealWidth,
  activationPx = 8,
  threshold = 40,
}: UseSwipeRevealOptions): SwipeReveal {
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const swipeStateRef = useRef<SwipeState | null>(null);
  const suppressClickKeyRef = useRef<string | null>(null);

  const clearReveal = useCallback(() => setRevealedKey(null), []);

  const consumeSuppression = useCallback((key: string) => {
    if (suppressClickKeyRef.current === key) {
      suppressClickKeyRef.current = null;
      return true;
    }
    return false;
  }, []);

  const isRevealed = useCallback(
    (key: string) => revealedKey === key,
    [revealedKey],
  );

  const bindings = useCallback(
    (key: string) => {
      const revealed = revealedKey === key;
      return {
        onPointerDown(event: ReactPointerEvent<HTMLElement>) {
          if (!event.isPrimary) return;
          if (event.pointerType === "mouse" && event.button !== 0) return;
          if (revealedKey !== null && revealedKey !== key) {
            setRevealedKey(null);
          }
          event.currentTarget.setPointerCapture(event.pointerId);
          swipeStateRef.current = {
            key,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startOffset: revealed ? -revealWidth : 0,
            offset: revealed ? -revealWidth : 0,
            dragging: false,
          };
        },
        onPointerMove(event: ReactPointerEvent<HTMLElement>) {
          const state = swipeStateRef.current;
          if (
            state == null ||
            state.key !== key ||
            state.pointerId !== event.pointerId
          ) {
            return;
          }
          const deltaX = event.clientX - state.startX;
          const deltaY = event.clientY - state.startY;
          const horizontal =
            Math.abs(deltaX) > Math.abs(deltaY) &&
            Math.abs(deltaX) > activationPx;
          if (!horizontal && !state.dragging) return;

          event.preventDefault();
          event.stopPropagation();

          const nextOffset = Math.min(
            0,
            Math.max(-revealWidth, state.startOffset + deltaX),
          );
          setRevealedKey((current) => {
            if (nextOffset <= -threshold) return key;
            if (state.startOffset < 0 && nextOffset > -threshold) return null;
            return current;
          });
          swipeStateRef.current = {
            ...state,
            offset: nextOffset,
            dragging: true,
          };
          
          const target = event.currentTarget;
          target.style.transition = "none";
          target.style.transform = `translate3d(${nextOffset}px, 0, 0)`;
        },
        onPointerUp(event: ReactPointerEvent<HTMLElement>) {
          const state = swipeStateRef.current;
          if (
            state == null ||
            state.key !== key ||
            state.pointerId !== event.pointerId
          ) {
            return;
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          const target = event.currentTarget;
          target.style.transition = "";
          target.style.transform = "";
          
          if (state.dragging) {
            const shouldReveal = state.offset <= -threshold;
            setRevealedKey(shouldReveal ? key : null);
            suppressClickKeyRef.current = key;
            event.preventDefault();
            event.stopPropagation();
          }
          swipeStateRef.current = null;
        },
        onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
          const state = swipeStateRef.current;
          if (state?.key === key && state.pointerId === event.pointerId) {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            const target = event.currentTarget;
            target.style.transition = "";
            target.style.transform = "";
            swipeStateRef.current = null;
          }
        },
      };
    },
    [activationPx, revealWidth, revealedKey, threshold],
  );

  return {
    revealedKey,
    setRevealedKey,
    isRevealed,
    clearReveal,
    consumeSuppression,
    bindings,
  };
}
