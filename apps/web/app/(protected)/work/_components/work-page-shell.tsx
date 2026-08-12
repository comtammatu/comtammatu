"use client";

import type { ReactNode } from "react";
import { AppEmptyState, AppListFrame } from "@/components/surface";
import type { ParsedWorkParams } from "../_lib/params";
import {
  WorkComposeShell,
  type WorkComposeArchetype,
} from "./compose/work-compose-shell";
import { WorkListToolbar } from "./work-list-toolbar";

export function WorkPageShell({
  params,
  departments,
  composeArchetype,
  loadError,
  children,
}: {
  params: ParsedWorkParams;
  departments: Array<{ id: number; name: string }>;
  composeArchetype: WorkComposeArchetype | null;
  loadError: string | null;
  children: ReactNode;
}) {
  const toolbar = (
    <WorkListToolbar
      params={params}
      departments={departments}
      showFilters={params.view === "mine"}
    />
  );

  if (loadError != null) {
    return (
      <AppListFrame contentScroll toolbar={toolbar}>
        <AppEmptyState mode="error" description={loadError} />
      </AppListFrame>
    );
  }

  if (composeArchetype != null) {
    return (
      <WorkComposeShell archetype={composeArchetype} toolbar={toolbar}>
        {children}
      </WorkComposeShell>
    );
  }

  return (
    <AppListFrame contentScroll toolbar={toolbar}>
      {children}
    </AppListFrame>
  );
}
