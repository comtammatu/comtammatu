"use client";

import { useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

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
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressTriggeredRef = useRef(false);

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

      isLongPressTriggeredRef.current = false;
      startPosRef.current = { x: e.clientX, y: e.clientY };

      clear();
      timeoutRef.current = setTimeout(() => {
        isLongPressTriggeredRef.current = true;
        onLongPress();
      }, delay);
    },
    [onLongPress, delay, clear]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!startPosRef.current) return;
      const dx = Math.abs(e.clientX - startPosRef.current.x);
      const dy = Math.abs(e.clientY - startPosRef.current.y);

      if (dx > moveThreshold || dy > moveThreshold) {
        clear();
      }
    },
    [moveThreshold, clear]
  );

  const onPointerUp = useCallback(
    () => {
      clear();
      startPosRef.current = null;

      if (!isLongPressTriggeredRef.current && onClick) {
        onClick();
      }
    },
    [clear, onClick]
  );

  const onPointerCancel = useCallback(() => {
    clear();
    startPosRef.current = null;
  }, [clear]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onContextMenu: useCallback((e: React.MouseEvent) => {
      // Prevent default context menu if we triggered a long press
      // Or if it's a touch device, to avoid system menus overlapping
      const nativeEvent = e.nativeEvent as PointerEvent;
      if (isLongPressTriggeredRef.current || nativeEvent.pointerType === "touch" || ('touches' in nativeEvent)) {
        e.preventDefault();
      }
    }, []),
  };
}
