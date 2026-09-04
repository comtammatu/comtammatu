/**
 * Work module compose styles — control_surface TASK_* recipes.
 * Aligns with ds-lab LIST_ITEM_INSET (`gap-2 px-3 py-3`) and AppListFrame law.
 * Import these constants instead of duplicating Tailwind strings in route bodies.
 * Layout-only: chrome (rounded/border) is owned by the Frame primitive —
 * render these inside `<Frame>`, never redeclare chrome here.
 */

/** Inbox / scope-picker Item rows inside AppListFrame (not edge-flush). */
export const WORK_LIST_ITEM_INSET = "gap-2 px-3 py-3";

/** Outer shell for TASK_BOARD | TASK_CALENDAR | TASK_TIMELINE bodies. */
export const WORK_TASK_VIEW_SHELL = "flex flex-col gap-3 px-3 py-3";

/** Month grid weekday header row. */
export const WORK_MONTH_WEEKDAY_ROW =
  "grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground";

/** Month grid day cells container. */
export const WORK_MONTH_DAY_GRID = "grid grid-cols-7 gap-1";

/** Default day cell — Frame child (Frame supplies rounded/border chrome). */
export const WORK_MONTH_CELL = "min-h-24 bg-background p-1 text-left";

/** Today highlight on a month cell (Frame still owns chrome). */
export const WORK_MONTH_CELL_TODAY = "bg-primary/10";

/** Desktop Kanban column grid (5 status columns). */
export const WORK_KANBAN_DESKTOP_GRID = "hidden gap-3 md:grid md:grid-cols-5";

/** Single Kanban column layout (Frame supplies rounded/border chrome). */
export const WORK_KANBAN_COLUMN =
  "flex min-h-96 flex-col gap-2.5 bg-muted/30 p-2.5";

/** Task chip inside a calendar day cell. */
export const WORK_TASK_CHIP =
  "h-auto w-full justify-start truncate px-1 py-0.5 text-2xs";

/** Timeline row layout (title + bar spanning 2 of 3 grid tracks). */
export const WORK_TIMELINE_ROW =
  "grid grid-cols-3 items-center gap-3 bg-background p-3";
