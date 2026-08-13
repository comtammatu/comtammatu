"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { useFormControlSize } from "@/components/form/control-size";
import { BusinessDatePicker } from "@/components/form";
import { AppToolbar } from "@/components/surface";
import { messages } from "@lib/messages";
import { formatAuditEntityTypeLabel } from "@comtammatu/shared/messages";
import type { ReactNode } from "react";

const ALL_VALUE = "all";

export type SystemActivityFilterValue = {
  entityType: string | null;
  entityId: string | null;
  actor: string | null;
  since: string | null;
  q: string | null;
};

export type SystemActivityActorOption = {
  id: string;
  label: string;
};

export type SystemActivityEntityOption = {
  id: string;
  label: string;
};

export function SystemActivityFilters({
  value,
  actorOptions,
  entityOptions,
  trailing,
}: {
  value: SystemActivityFilterValue;
  actorOptions: SystemActivityActorOption[];
  entityOptions: SystemActivityEntityOption[];
  trailing?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const controlSize = useFormControlSize();
  const optionSize = controlSize === "touch" ? "touch" : "default";
  const actionSize = controlSize === "touch" ? "touch" : "sm";
  const copy = messages.settings.activity;
  const filterIdPrefix = useId();
  const entityFilterId = `${filterIdPrefix}-entity`;
  const actorFilterId = `${filterIdPrefix}-actor`;
  const sinceFilterId = `${filterIdPrefix}-since`;
  const searchFilterId = `${filterIdPrefix}-q`;

  const [draftSince, setDraftSince] = useState(value.since ?? "");
  const [draftQ, setDraftQ] = useState(value.q ?? "");
  useEffect(() => {
    setDraftSince(value.since ?? "");
  }, [value.since]);
  useEffect(() => {
    setDraftQ(value.q ?? "");
  }, [value.q]);

  function pushParams(next: Partial<SystemActivityFilterValue>) {
    const merged: SystemActivityFilterValue = { ...value, ...next };
    const usp = new URLSearchParams();
    if (merged.entityType) usp.set("entity_type", merged.entityType);
    if (merged.entityId) usp.set("entity_id", merged.entityId);
    if (merged.actor) usp.set("actor", merged.actor);
    if (merged.since) usp.set("since", merged.since);
    if (merged.q) usp.set("q", merged.q);
    const qs = usp.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  const entityValue = value.entityType ?? ALL_VALUE;
  const actorValue = value.actor ?? ALL_VALUE;
  const sinceDirty = draftSince !== (value.since ?? "");
  const qDirty = draftQ !== (value.q ?? "");
  const hasActiveFilters = Boolean(
    value.entityType ||
      value.entityId ||
      value.actor ||
      value.since ||
      value.q ||
      draftSince ||
      draftQ,
  );

  return (
    <AppToolbar variant="inline">
      <div className="flex flex-wrap items-end gap-3 px-0.5">
        <div className="grid gap-1.5">
          <Label htmlFor={entityFilterId}>{copy.entity}</Label>
          <Select
            value={entityValue}
            onValueChange={(next) =>
              pushParams({
                entityType: next === ALL_VALUE ? null : next,
                entityId:
                  next === ALL_VALUE || next !== value.entityType
                    ? null
                    : value.entityId,
              })
            }
          >
            <SelectTrigger id={entityFilterId} size={controlSize}>
              <SelectValue placeholder={copy.filterEntityAll} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE} size={optionSize}>
                {copy.filterEntityAll}
              </SelectItem>
              {entityOptions.map((option) => (
                <SelectItem key={option.id} value={option.id} size={optionSize}>
                  {option.label || formatAuditEntityTypeLabel(option.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={actorFilterId}>{copy.actor}</Label>
          <Select
            value={actorValue}
            onValueChange={(next) =>
              pushParams({
                actor: next === ALL_VALUE ? null : next,
              })
            }
          >
            <SelectTrigger id={actorFilterId} size={controlSize}>
              <SelectValue placeholder={copy.filterActorAll} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE} size={optionSize}>
                {copy.filterActorAll}
              </SelectItem>
              {actorOptions.map((option) => (
                <SelectItem key={option.id} value={option.id} size={optionSize}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={sinceFilterId}>{copy.filterSince}</Label>
          <BusinessDatePicker
            id={sinceFilterId}
            value={draftSince}
            onValueChange={setDraftSince}
            className="min-w-40"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={searchFilterId}>{copy.searchLabel}</Label>
          <Input
            id={searchFilterId}
            type="search"
            value={draftQ}
            onChange={(event) => setDraftQ(event.target.value)}
            placeholder={copy.searchPlaceholder}
            controlSize={controlSize}
            className="min-w-48"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size={actionSize}
            disabled={isPending || (!sinceDirty && !qDirty)}
            onClick={() =>
              pushParams({
                since: draftSince.trim() ? draftSince : null,
                q: draftQ.trim() ? draftQ.trim() : null,
              })
            }
          >
            {copy.filterApply}
          </Button>
          <Button
            type="button"
            variant="outline"
            size={actionSize}
            disabled={isPending || !hasActiveFilters}
            onClick={() => {
              setDraftSince("");
              setDraftQ("");
              pushParams({
                entityType: null,
                entityId: null,
                actor: null,
                since: null,
                q: null,
              });
            }}
          >
            {copy.filterReset}
          </Button>
          {trailing}
        </div>
      </div>

      {value.entityId ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {copy.filterEntityIdActive(value.entityId)}
          </span>
          <Button
            type="button"
            variant="outline"
            size={actionSize}
            disabled={isPending}
            onClick={() => pushParams({ entityId: null })}
          >
            {copy.clearEntityId}
          </Button>
        </div>
      ) : null}
    </AppToolbar>
  );
}
