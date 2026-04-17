"use client";

import { useEffect, useRef } from "react";

export interface KeyboardShortcut {
  /** Key to listen for, matched case-insensitively against `event.key`.
   * Examples: "Enter", "Escape", "/", "d", "t", "Backspace". */
  key: string;
  handler: (event: KeyboardEvent) => void;
  /** Require Cmd (mac) or Ctrl (others). Default false. */
  meta?: boolean;
  /** Require Shift. Default false. */
  shift?: boolean;
  /** Require Alt/Option. Default false. */
  alt?: boolean;
  /** When true, fire even if focus is in an input/textarea/contenteditable.
   * Default false — most shortcuts should NOT steal user's typing. */
  fireInInput?: boolean;
  /** Call event.preventDefault() before handler. Default false. */
  preventDefault?: boolean;
  /** Call event.stopPropagation() before handler. Default false. */
  stopPropagation?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function matches(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false;
  const meta = event.metaKey || event.ctrlKey;
  if ((shortcut.meta ?? false) !== meta) return false;
  if ((shortcut.shift ?? false) !== event.shiftKey) return false;
  if ((shortcut.alt ?? false) !== event.altKey) return false;
  return true;
}

/** Listen for global keyboard shortcuts. Shortcuts are checked in array
 * order; the first match wins. Pass `enabled={false}` to disable all
 * shortcuts (e.g., when a modal is open and handles its own keys).
 *
 * By default, shortcuts do NOT fire when focus is inside an editable
 * element (Input/Textarea/contenteditable). Set `fireInInput: true` for
 * meta-prefixed shortcuts like Cmd+Enter that should work while typing. */
export function useKeyboardShortcut(
  shortcuts: KeyboardShortcut[],
  enabled = true,
): void {
  // Keep a ref so consumers don't need to memoize the shortcuts array.
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      const editable = isEditableTarget(event.target);
      for (const shortcut of shortcutsRef.current) {
        if (!matches(event, shortcut)) continue;
        if (editable && !shortcut.fireInInput) continue;
        if (shortcut.preventDefault) event.preventDefault();
        if (shortcut.stopPropagation) event.stopPropagation();
        shortcut.handler(event);
        break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
