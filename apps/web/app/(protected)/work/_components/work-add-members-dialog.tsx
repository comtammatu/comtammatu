"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Frame } from "@comtammatu/ui/components/frame";
import { Input } from "@comtammatu/ui/components/input";
import { Item } from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppDialog, AppDialogFooter } from "@/components/form";
import { AppEmptyState } from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";
import { matchesSearch } from "@lib/search";
import { workCopy } from "@lib/messages/work";
import { cn } from "@comtammatu/ui/lib/utils";
import {
  upsertWorkDepartmentMembers,
  type WorkProfileOption,
} from "../actions";

export function WorkAddMembersDialog({
  open,
  onOpenChange,
  departmentId,
  departmentName,
  candidates,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: number;
  departmentName?: string;
  candidates: WorkProfileOption[];
  onSuccess: () => void;
}) {
  const controlSize = useFormControlSize();
  const selectAllId = useId();
  const [isPending, startTransition] = useTransition();

  const [role, setRole] = useState<"lead" | "member">("member");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Distinct branch list from candidates
  const branchOptions = useMemo(() => {
    const branches = new Map<number, string>();
    let hasOffice = false;

    for (const candidate of candidates) {
      if (candidate.branchId != null && candidate.branchName) {
        branches.set(candidate.branchId, candidate.branchName);
      } else if (candidate.branchId == null) {
        hasOffice = true;
      }
    }

    const list: Array<{ value: string; label: string }> = [
      { value: "all", label: workCopy.teamAddAllBranches },
    ];
    if (hasOffice) {
      list.push({ value: "office", label: workCopy.teamAddOfficeBranch });
    }
    for (const [bId, bName] of branches.entries()) {
      list.push({ value: String(bId), label: bName });
    }
    return list;
  }, [candidates]);

  // Filtered candidate list based on branch and search
  const filteredCandidates = useMemo(() => {
    return candidates.filter((candidate) => {
      // Branch filter
      if (selectedBranch === "office") {
        if (candidate.branchId != null) return false;
      } else if (selectedBranch !== "all") {
        if (String(candidate.branchId) !== selectedBranch) return false;
      }

      // Search filter
      if (searchQuery.trim().length > 0) {
        const searchable = [
          candidate.fullName,
          candidate.branchName ?? workCopy.teamAddOfficeBranch,
        ];
        if (!matchesSearch(searchable, searchQuery)) {
          return false;
        }
      }

      return true;
    });
  }, [candidates, selectedBranch, searchQuery]);

  // Check if all filtered candidates are selected
  const allFilteredSelected =
    filteredCandidates.length > 0 &&
    filteredCandidates.every((c) => selectedIds.has(c.id));

  const someFilteredSelected =
    filteredCandidates.some((c) => selectedIds.has(c.id)) &&
    !allFilteredSelected;

  function toggleCandidate(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const candidate of filteredCandidates) {
          next.delete(candidate.id);
        }
      } else {
        for (const candidate of filteredCandidates) {
          next.add(candidate.id);
        }
      }
      return next;
    });
  }

  function handleClose() {
    onOpenChange(false);
    setSelectedIds(new Set());
    setSearchQuery("");
    setSelectedBranch("all");
    setRole("member");
  }

  function handleSubmit() {
    if (selectedIds.size === 0) return;

    startTransition(async () => {
      const result = await upsertWorkDepartmentMembers({
        departmentId,
        userIds: Array.from(selectedIds),
        role,
      });

      if (!result.success) {
        toast.error(result.error ?? workCopy.teamAddFailed);
        return;
      }

      toast.success(workCopy.teamAddSuccess);
      onSuccess();
      handleClose();
    });
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
        else onOpenChange(true);
      }}
      title={workCopy.teamAdd}
      description={departmentName}
      contentClassName="max-w-lg"
      footer={
        <AppDialogFooter>
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {workCopy.teamAddSelectedCount}:{" "}
              <strong className="text-foreground">{selectedIds.size}</strong>/
              {candidates.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size={controlSize}
                disabled={isPending}
                onClick={handleClose}
              >
                {workCopy.cancel}
              </Button>
              <Button
                type="button"
                size={controlSize}
                disabled={isPending || selectedIds.size === 0}
                onClick={handleSubmit}
              >
                {selectedIds.size > 0
                  ? `${workCopy.teamAdd} (${selectedIds.size})`
                  : workCopy.teamAdd}
              </Button>
            </div>
          </div>
        </AppDialogFooter>
      }
    >
      <div className="flex flex-col gap-3 py-1">
        {/* Controls: Role & Branch Filter */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {workCopy.teamRoleLabel}
            </Label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as "lead" | "member")}
              disabled={isPending}
            >
              <SelectTrigger size={controlSize} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">{workCopy.teamRoleMember}</SelectItem>
                <SelectItem value="lead">{workCopy.teamRoleLead}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {workCopy.teamAddBranchFilter}
            </Label>
            <Select
              value={selectedBranch}
              onValueChange={setSelectedBranch}
              disabled={isPending}
            >
              <SelectTrigger size={controlSize} className="w-full">
                <SelectValue placeholder={workCopy.teamAddBranchFilter} />
              </SelectTrigger>
              <SelectContent>
                {branchOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Search Input */}
        <div className="flex flex-col gap-1.5">
          <Input
            placeholder={workCopy.teamAddSearchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isPending}
          />
        </div>

        {/* Select All Toggle Bar */}
        {filteredCandidates.length > 0 ? (
          <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <Checkbox
                id={selectAllId}
                checked={
                  allFilteredSelected
                    ? true
                    : someFilteredSelected
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={toggleSelectAll}
                disabled={isPending}
              />
              <Label
                htmlFor={selectAllId}
                className="cursor-pointer font-medium"
              >
                {allFilteredSelected
                  ? workCopy.teamAddDeselectAll
                  : workCopy.teamAddSelectAll}
              </Label>
            </div>
            <span className="text-muted-foreground">
              {filteredCandidates.length} {workCopy.teamAddCandidateSuffix}
            </span>
          </div>
        ) : null}

        {/* Candidate Checkbox List */}
        <Frame className="no-scrollbar max-h-64 overflow-y-auto p-1">
          {candidates.length === 0 ? (
            <AppEmptyState
              mode="no-data"
              description={workCopy.teamAddNoCandidates}
              compact
            />
          ) : filteredCandidates.length === 0 ? (
            <AppEmptyState
              mode="no-data"
              description={workCopy.teamAddNoResults}
              compact
            />
          ) : (
            <div className="flex flex-col gap-1">
              {filteredCandidates.map((candidate) => {
                const isChecked = selectedIds.has(candidate.id);
                const checkboxId = `candidate-${candidate.id}`;
                const branchLabel =
                  candidate.branchName ?? workCopy.teamAddOfficeBranch;

                return (
                  <Item
                    key={candidate.id}
                    render={<Label htmlFor={checkboxId} />}
                    variant="outline"
                    className={cn(
                      "min-w-0 cursor-pointer items-center justify-between gap-2 px-3 py-2 transition-colors",
                      isChecked ? "border-primary bg-primary/10" : "hover:bg-muted/30",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Checkbox
                        id={checkboxId}
                        checked={isChecked}
                        onCheckedChange={() => toggleCandidate(candidate.id)}
                        disabled={isPending}
                      />
                      <span className="min-w-0 truncate text-sm font-medium">
                        {candidate.fullName}
                      </span>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-2xs">
                      {branchLabel}
                    </Badge>
                  </Item>
                );
              })}
            </div>
          )}
        </Frame>
      </div>
    </AppDialog>
  );
}
