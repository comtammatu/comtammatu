"use client";

import { useCallback, useRef } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

type PointerPosition = { x: number; y: number };

export function hasLongPressMoved(
  start: PointerPosition,
  current: PointerPosition,
  threshold: number,
): boolean {
  return (
    Math.abs(current.x - start.x) > threshold ||
    Math.abs(current.y - start.y) > threshold
  );
}

interface UseLongPressOptions {
  onLongPress: () => void;
  onClick?: () => void;
  delay?: number;
  moveThreshold?: number; // How many pixels they can move before it cancels
}

export function useLongPress({
  onLongPress,
  onClick,
  delay = 500,
  moveThreshold = 10,
}: UseLongPressOptions) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<PointerPosition | null>(null);
  const isLongPressTriggeredRef = useRef(false);
  const isCancelledRef = useRef(false);

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!e.isPrimary) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;

      const interactiveTarget = (e.target as HTMLElement).closest(
        "a, button, input, select, textarea, [role='button'], [contenteditable='true']",
      );
      if (interactiveTarget && interactiveTarget !== e.currentTarget) {
        isCancelledRef.current = true;
        startPosRef.current = null;
        clear();
        return;
      }

      isLongPressTriggeredRef.current = false;
      isCancelledRef.current = false;
      startPosRef.current = { x: e.clientX, y: e.clientY };

      clear();
      timeoutRef.current = setTimeout(() => {
        isLongPressTriggeredRef.current = true;
        onLongPress();
      }, delay);
    },
    [onLongPress, delay, clear],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!startPosRef.current) return;
      if (
        hasLongPressMoved(
          startPosRef.current,
          { x: e.clientX, y: e.clientY },
          moveThreshold,
        )
      ) {
        isCancelledRef.current = true;
        startPosRef.current = null;
        clear();
      }
    },
    [moveThreshold, clear],
  );

  const onPointerUp = useCallback(
    () => {
      const shouldClick =
        startPosRef.current !== null &&
        !isCancelledRef.current &&
        !isLongPressTriggeredRef.current;
      clear();
      startPosRef.current = null;

      if (shouldClick) onClick?.();
    },
    [clear, onClick],
  );

  const onPointerCancel = useCallback(() => {
    isCancelledRef.current = true;
    clear();
    startPosRef.current = null;
  }, [clear]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      if (!onClick || e.target !== e.currentTarget) return;
      if (e.key === "Enter") {
        e.preventDefault();
        onClick();
      } else if (e.key === " ") {
        e.preventDefault();
      }
    },
    [onClick],
  );

  const onKeyUp = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      if (!onClick || e.target !== e.currentTarget || e.key !== " ") return;
      e.preventDefault();
      onClick();
    },
    [onClick],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave: onPointerCancel,
    onKeyDown,
    onKeyUp,
    role: onClick ? "button" : undefined,
    tabIndex: onClick ? 0 : undefined,
    onContextMenu: useCallback((e: React.MouseEvent) => {
      const nativeEvent = e.nativeEvent as PointerEvent;
      if (
        isLongPressTriggeredRef.current ||
        nativeEvent.pointerType === "touch" ||
        "touches" in nativeEvent
      ) {
        e.preventDefault();
      }
    }, []),
  };
}
