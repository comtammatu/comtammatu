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
import { AppToolbar } from "@/components/surface";
import { messages } from "@lib/messages";

export interface PermissionAuditTargetOption {
  id: string;
  label: string;
}

export interface PermissionAuditFilterValue {
  action: string | null;
  target: string | null;
  since: string | null;
}

// The select control reserves empty-string item values; this sentinel maps to the
// "no filter" state and is serialized as an absent query param.
const ALL_VALUE = "all";

const ACTION_VALUES = ["grant", "revoke", "apply_template"] as const;

export function PermissionAuditFilters({
  value,
  targetOptions,
}: {
  value: PermissionAuditFilterValue;
  targetOptions: PermissionAuditTargetOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const controlSize = useFormControlSize();
  const optionSize = controlSize === "touch" ? "touch" : "default";
  const actionSize = controlSize === "touch" ? "touch" : "sm";
  const copy = messages.owner.staffAudit;
  const filterIdPrefix = useId();
  const actionFilterId = `${filterIdPrefix}-action`;
  const targetFilterId = `${filterIdPrefix}-target`;
  const sinceFilterId = `${filterIdPrefix}-since`;

  // `since` is a free-typed date; push on Apply rather than per keystroke.
  const [draftSince, setDraftSince] = useState(value.since ?? "");
  useEffect(() => {
    setDraftSince(value.since ?? "");
  }, [value.since]);

  function pushParams(next: Partial<PermissionAuditFilterValue>) {
    const merged: PermissionAuditFilterValue = { ...value, ...next };
    const usp = new URLSearchParams();
    if (merged.action) usp.set("action", merged.action);
    if (merged.target) usp.set("target", merged.target);
    if (merged.since) usp.set("since", merged.since);
    const qs = usp.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  const actionValue = value.action ?? ALL_VALUE;
  const targetValue = value.target ?? ALL_VALUE;
  const sinceDirty = draftSince !== (value.since ?? "");
  const hasActive = Boolean(value.action || value.target || value.since);

  return (
    <AppToolbar
      filters={
        <>
          <div className="grid gap-1.5">
            <Label htmlFor={actionFilterId} className="text-xs">
              {copy.action}
            </Label>
            <Select
              value={actionValue}
              onValueChange={(v) =>
                pushParams({ action: v === ALL_VALUE ? null : v })
              }
              disabled={isPending}
            >
              <SelectTrigger
                id={actionFilterId}
                size={controlSize}
                className="min-w-40"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE} size={optionSize}>
                  {copy.filterActionAll}
                </SelectItem>
                {ACTION_VALUES.map((action) => (
                  <SelectItem key={action} value={action} size={optionSize}>
                    {action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={targetFilterId} className="text-xs">
              {copy.target}
            </Label>
            <Select
              value={targetValue}
              onValueChange={(v) =>
                pushParams({ target: v === ALL_VALUE ? null : v })
              }
              disabled={isPending}
            >
              <SelectTrigger
                id={targetFilterId}
                size={controlSize}
                className="min-w-48"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE} size={optionSize}>
                  {copy.filterTargetAll}
                </SelectItem>
                {targetOptions.map((option) => (
                  <SelectItem
                    key={option.id}
                    value={option.id}
                    size={optionSize}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={sinceFilterId} className="text-xs">
              {copy.filterSince}
            </Label>
            <div className="flex items-end gap-2">
              <Input
                id={sinceFilterId}
                type="date"
                value={draftSince}
                onChange={(e) => setDraftSince(e.target.value)}
                controlSize={controlSize}
                className="min-w-40"
              />
              <Button
                size={actionSize}
                onClick={() => pushParams({ since: draftSince || null })}
                disabled={isPending || !sinceDirty}
              >
                {copy.filterApply}
              </Button>
            </div>
          </div>
        </>
      }
      reset={
        hasActive ? (
          <Button
            variant="ghost"
            size={actionSize}
            onClick={() => {
              setDraftSince("");
              pushParams({ action: null, target: null, since: null });
            }}
            disabled={isPending}
          >
            {copy.filterReset}
          </Button>
        ) : null
      }
    />
  );
}
