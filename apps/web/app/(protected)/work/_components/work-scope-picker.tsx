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
import { workHref, type ParsedWorkParams } from "../_lib/params";

export function WorkScopePicker({
  params,
  departments,
  projects,
}: {
  params: ParsedWorkParams;
  departments: WorkDepartmentOption[];
  projects: WorkProjectOption[];
}) {
  return (
    <div className="flex flex-col gap-4 px-3 py-3">
      <AppEmptyState
        mode="no-data"
        title={workCopy.pickScope}
        description={workCopy.boardNeedsScope}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{workCopy.scopeDepartment}</h2>
          {departments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{workCopy.inboxEmpty}</p>
          ) : (
            departments.map((department) => (
              <Item
                key={department.id}
                variant="outline"
                render={
                  <Link
                    href={workHref(params, {
                      view: "board",
                      departmentId: department.id,
                      projectId: null,
                    })}
                  />
                }
              >
                <ItemContent>
                  <ItemTitle>{department.name}</ItemTitle>
                  <ItemDescription>{workCopy.viewBoard}</ItemDescription>
                </ItemContent>
              </Item>
            ))
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{workCopy.scopeProject}</h2>
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
                      view: "board",
                      projectId: project.id,
                      departmentId: null,
                    })}
                  />
                }
              >
                <ItemContent>
                  <ItemTitle>{project.name}</ItemTitle>
                  <ItemDescription>{workCopy.viewBoard}</ItemDescription>
                </ItemContent>
              </Item>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
