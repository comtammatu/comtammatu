"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { AppEmptyState, AppListFrame } from "@/components/surface";
import { workCopy } from "@lib/messages/work";
import type {
  WorkDepartmentOption,
  WorkProjectOption,
} from "../actions";
import type { ParsedWorkParams } from "../_lib/params";
import {
  WorkComposeShell,
  type WorkComposeArchetype,
} from "./compose/work-compose-shell";
import {
  WorkScopeDialog,
  type WorkScopeDialogMode,
} from "./compose/work-scope-dialog";
import { WorkListToolbar } from "./work-list-toolbar";

export function WorkPageShell({
  params,
  departments,
  projects,
  departmentName,
  projectName,
  needsScope,
  scopeMode,
  composeArchetype,
  loadError,
  scopeEmptyDescription,
  children,
}: {
  params: ParsedWorkParams;
  departments: WorkDepartmentOption[];
  projects: WorkProjectOption[];
  departmentName: string | null;
  projectName: string | null;
  needsScope: boolean;
  scopeMode: WorkScopeDialogMode;
  composeArchetype: WorkComposeArchetype | null;
  loadError: string | null;
  scopeEmptyDescription?: string | null;
  children: ReactNode;
}) {
  const [scopeOpen, setScopeOpen] = useState(false);

  useEffect(() => {
    if (needsScope) {
      setScopeOpen(true);
    }
  }, [needsScope]);

  const scopeSummary =
    projectName != null
      ? `${workCopy.scopeProject}: ${projectName}`
      : departmentName != null
        ? `${workCopy.scopeDepartment}: ${departmentName}`
        : workCopy.viewMine;

  const showScopeButton =
    params.view === "board" ||
    params.view === "calendar" ||
    params.view === "timeline";

  const toolbar = (
    <WorkListToolbar
      params={params}
      showFilters={params.view === "mine"}
      scopeSummary={showScopeButton ? scopeSummary : undefined}
      onOpenScope={showScopeButton ? () => setScopeOpen(true) : undefined}
    />
  );

  const body =
    needsScope && scopeEmptyDescription ? (
      <AppEmptyState
        mode="no-data"
        description={scopeEmptyDescription}
        compact
      >
        <Button type="button" size="sm" onClick={() => setScopeOpen(true)}>
          {workCopy.scopeDialogTitle}
        </Button>
      </AppEmptyState>
    ) : (
      children
    );

  const frame =
    loadError != null ? (
      <AppListFrame contentScroll toolbar={toolbar}>
        <AppEmptyState mode="error" description={loadError} />
      </AppListFrame>
    ) : composeArchetype != null ? (
      <WorkComposeShell archetype={composeArchetype} toolbar={toolbar}>
        {body}
      </WorkComposeShell>
    ) : (
      <AppListFrame contentScroll toolbar={toolbar}>
        {body}
      </AppListFrame>
    );

  return (
    <>
      {frame}
      <WorkScopeDialog
        open={scopeOpen}
        onOpenChange={setScopeOpen}
        params={params}
        departments={departments}
        projects={projects}
        mode={scopeMode}
      />
    </>
  );
}
