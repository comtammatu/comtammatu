import type { ReactNode } from "react";
import { AppListFrame } from "@/components/surface";
import { WORK_TASK_VIEW_SHELL } from "../../_lib/compose-styles";

export type WorkComposeArchetype =
  | "TASK_BOARD"
  | "TASK_CALENDAR"
  | "TASK_TIMELINE";

export function WorkComposeShell({
  archetype,
  toolbar,
  title,
  children,
}: {
  archetype: WorkComposeArchetype;
  toolbar?: ReactNode;
  title?: string;
  children: ReactNode;
}) {
  return (
    <AppListFrame contentScroll toolbar={toolbar}>
      <div data-page-archetype={archetype} className={WORK_TASK_VIEW_SHELL}>
        {title ? (
          <h2 className="font-heading text-lg font-semibold">{title}</h2>
        ) : null}
        {children}
      </div>
    </AppListFrame>
  );
}
