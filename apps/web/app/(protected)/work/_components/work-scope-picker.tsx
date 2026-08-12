"use client";

import Link from "next/link";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppEmptyState } from "@/components/surface";
import type {
  WorkDepartmentOption,
  WorkProjectOption,
} from "../actions";
import { workCopy } from "@lib/messages/work";
import {
  WORK_LIST_ITEM_INSET,
  WORK_SCOPE_SECTION_TITLE,
} from "../_lib/compose-styles";
import {
  workHref,
  type ParsedWorkParams,
  type WorkView,
} from "../_lib/params";

export function WorkScopePicker({
  params,
  departments,
  projects,
  targetView = "board",
  mode = "board-or-project",
}: {
  params: ParsedWorkParams;
  departments: WorkDepartmentOption[];
  projects: WorkProjectOption[];
  targetView?: Extract<WorkView, "board" | "timeline">;
  mode?: "board-or-project" | "project-only";
}) {
  const description =
    mode === "project-only"
      ? workCopy.timelineNeedsScope
      : workCopy.boardNeedsScope;

  const viewLabel =
    targetView === "timeline" ? workCopy.viewTimeline : workCopy.viewBoard;

  return (
    <div className={`flex flex-col ${WORK_LIST_ITEM_INSET}`}>
      <AppEmptyState
        mode="no-data"
        title={workCopy.pickScope}
        description={description}
      />
      <div
        className={
          mode === "project-only"
            ? "flex flex-col gap-2"
            : "grid gap-4 md:grid-cols-2"
        }
      >
        {mode === "board-or-project" ? (
          <section className="flex flex-col gap-2">
            <h2 className={WORK_SCOPE_SECTION_TITLE}>
              {workCopy.scopeDepartment}
            </h2>
            {departments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {workCopy.inboxEmpty}
              </p>
            ) : (
              departments.map((department) => (
                <Item
                  key={department.id}
                  variant="outline"
                  render={
                    <Link
                      href={workHref(params, {
                        view: targetView,
                        departmentId: department.id,
                        projectId: null,
                      })}
                    />
                  }
                >
                  <ItemContent>
                    <ItemTitle>{department.name}</ItemTitle>
                    <ItemDescription>{viewLabel}</ItemDescription>
                  </ItemContent>
                </Item>
              ))
            )}
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <h2 className={WORK_SCOPE_SECTION_TITLE}>{workCopy.scopeProject}</h2>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">{workCopy.inboxEmpty}</p>
          ) : (
            projects.map((project) => (
              <Item
                key={project.id}
                variant="outline"
                render={
                  <Link
                    href={workHref(params, {
                      view: targetView,
                      projectId: project.id,
                      departmentId: null,
                    })}
                  />
                }
              >
                <ItemContent>
                  <ItemTitle>{project.name}</ItemTitle>
                  <ItemDescription>{viewLabel}</ItemDescription>
                </ItemContent>
              </Item>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
