"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@/components/confirm-dialog";
import {
  AppFormGrid,
  AppFormRow,
  FormDialog,
  TextField,
} from "@/components/form";
import { AppDialog } from "@/components/form/form-dialog";
import { useFormControlSize } from "@/components/form/control-size";
import { AppEmptyState } from "@/components/surface";
import { workCopy } from "@lib/messages/work";
import { WORK_LIST_ITEM_INSET } from "../_lib/compose-styles";
import {
  deactivateWorkDepartment,
  deactivateWorkDepartmentMember,
  ensurePilotDepartment,
  listWorkCandidateProfiles,
  listWorkDepartmentMembers,
  setWorkDepartmentMemberRole,
  upsertWorkDepartment,
  type WorkDepartmentMemberRow,
  type WorkDepartmentOption,
  type WorkMemberRole,
  type WorkProfileOption,
} from "../actions";
import { WorkAddMembersDialog } from "./work-add-members-dialog";

const departmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

type DepartmentValues = z.infer<typeof departmentSchema>;

export function WorkSettingsDialog({
  open,
  onOpenChange,
  departments,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: WorkDepartmentOption[];
}) {
  const router = useRouter();
  const controlSize = useFormControlSize();
  const [isPending, startTransition] = useTransition();
  const [departmentDialogOpen, setDepartmentDialogOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] =
    useState<WorkDepartmentOption | null>(null);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberDepartmentId, setMemberDepartmentId] = useState<number | null>(
    departments[0]?.id ?? null,
  );
  const [members, setMembers] = useState<WorkDepartmentMemberRow[]>([]);
  const [candidates, setCandidates] = useState<WorkProfileOption[]>([]);

  const [reloadKey, setReloadKey] = useState(0);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");

  const filteredMembers = useMemo(() => {
    const q = memberSearchQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.fullName.toLowerCase().includes(q));
  }, [members, memberSearchQuery]);

  useEffect(() => {
    setMemberSearchQuery("");
  }, [memberDepartmentId, open]);

  useEffect(() => {
    if (!open) return;
    setMemberDepartmentId((current) => {
      if (current != null && departments.some((d) => d.id === current)) {
        return current;
      }
      return departments[0]?.id ?? null;
    });
  }, [open, departments]);

  useEffect(() => {
    if (!open || memberDepartmentId == null) {
      setMembers([]);
      setCandidates([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [membersResult, candidatesResult] = await Promise.all([
        listWorkDepartmentMembers({ departmentId: memberDepartmentId }),
        listWorkCandidateProfiles({ departmentId: memberDepartmentId }),
      ]);
      if (cancelled) return;
      setMembers(
        membersResult.success && membersResult.data
          ? membersResult.data.items
          : [],
      );
      setCandidates(
        candidatesResult.success && candidatesResult.data
          ? candidatesResult.data.items
          : [],
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open, memberDepartmentId, reloadKey]);

  const departmentDialogTitle = editingDepartment
    ? workCopy.departmentRenameTitle
    : workCopy.departmentCreateTitle;

  const departmentDefaultValues = useMemo(
    () => ({ name: editingDepartment?.name ?? "" }),
    [editingDepartment],
  );

  function refreshPage() {
    router.refresh();
  }

  function openCreateDepartment() {
    setEditingDepartment(null);
    setDepartmentDialogOpen(true);
  }

  function openRenameDepartment(department: WorkDepartmentOption) {
    setEditingDepartment(department);
    setDepartmentDialogOpen(true);
  }

  async function bootstrapPilot() {
    startTransition(async () => {
      const result = await ensurePilotDepartment({});
      if (!result.success) {
        toast.error(result.error ?? workCopy.departmentCreateFailed);
        return;
      }
      toast.success(workCopy.save);
      refreshPage();
    });
  }

  return (
    <>
      <AppDialog
        open={open}
        onOpenChange={onOpenChange}
        title={workCopy.settingsTitle}
        contentClassName="max-w-xl"
      >
        <Tabs defaultValue="departments" className="flex flex-col gap-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="departments" className="gap-1.5">
              <span>{workCopy.settingsTabDepartments}</span>
              <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                {departments.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-1.5">
              <span>{workCopy.settingsTabMembers}</span>
              <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                {members.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="departments" className="flex flex-col gap-3">
            {departments.length === 0 ? (
              <AppEmptyState
                mode="no-data"
                description={workCopy.teamNoDepartment}
                compact
              />
            ) : (
              <div className={`max-h-80 overflow-y-auto pr-1 flex flex-col gap-2 ${WORK_LIST_ITEM_INSET}`}>
                {departments.map((department) => (
                  <Item key={department.id} variant="outline">
                    <ItemContent>
                      <ItemTitle>{department.name}</ItemTitle>
                    </ItemContent>
                    <ItemActions className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size={controlSize}
                        variant="outline"
                        onClick={() => openRenameDepartment(department)}
                      >
                        {workCopy.departmentRenameTitle}
                      </Button>
                      <Button
                        type="button"
                        size={controlSize}
                        variant="outline"
                        disabled={isPending}
                        onClick={async () => {
                          const ok = await confirm({
                            title: workCopy.departmentDeactivate,
                            description: workCopy.departmentDeactivateConfirm,
                            confirmText: workCopy.departmentDeactivate,
                            variant: "destructive",
                          });
                          if (!ok) return;
                          startTransition(async () => {
                            const result = await deactivateWorkDepartment({
                              departmentId: department.id,
                            });
                            if (!result.success) {
                              toast.error(
                                result.error ??
                                  workCopy.departmentDeactivateFailed,
                              );
                              return;
                            }
                            toast.success(workCopy.save);
                            refreshPage();
                          });
                        }}
                      >
                        {workCopy.departmentDeactivate}
                      </Button>
                    </ItemActions>
                  </Item>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size={controlSize}
                onClick={openCreateDepartment}
              >
                {workCopy.departmentAdd}
              </Button>
              {departments.length === 0 ? (
                <Button
                  type="button"
                  size={controlSize}
                  variant="outline"
                  disabled={isPending}
                  onClick={bootstrapPilot}
                >
                  {workCopy.teamEnsurePilot}
                </Button>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="members" className="flex flex-col gap-3">
            {departments.length === 0 ? (
              <AppEmptyState
                mode="no-data"
                description={workCopy.teamNoDepartment}
                compact
              />
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Select
                      value={
                        memberDepartmentId != null
                          ? String(memberDepartmentId)
                          : undefined
                      }
                      onValueChange={(value) =>
                        setMemberDepartmentId(Number(value))
                      }
                    >
                      <SelectTrigger size={controlSize} className="flex-1">
                        <SelectValue placeholder={workCopy.scopeDepartment} />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((department) => (
                          <SelectItem
                            key={department.id}
                            value={String(department.id)}
                          >
                            {department.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size={controlSize}
                      onClick={() => setMemberDialogOpen(true)}
                      disabled={candidates.length === 0}
                    >
                      {workCopy.teamAdd}
                    </Button>
                  </div>
                  {members.length > 3 ? (
                    <Input
                      placeholder={workCopy.teamMemberSearchPlaceholder}
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      className="w-full"
                    />
                  ) : null}
                </div>

                {members.length === 0 ? (
                  <AppEmptyState
                    mode="no-data"
                    description={workCopy.teamEmpty}
                    compact
                  >
                    <Button
                      type="button"
                      size={controlSize}
                      onClick={() => setMemberDialogOpen(true)}
                      disabled={candidates.length === 0}
                    >
                      {workCopy.teamAdd}
                    </Button>
                  </AppEmptyState>
                ) : filteredMembers.length === 0 ? (
                  <AppEmptyState
                    mode="no-data"
                    description={workCopy.teamAddNoResults}
                    compact
                  />
                ) : (
                  <div className={`max-h-80 overflow-y-auto pr-1 flex flex-col gap-2 ${WORK_LIST_ITEM_INSET}`}>
                    {filteredMembers.map((member) => (
                      <Item key={member.id} variant="outline" className="p-2.5">
                        <ItemContent className="gap-1 min-w-0">
                          <ItemTitle className="truncate font-medium text-sm">
                            {member.fullName}
                          </ItemTitle>
                          <Badge
                            variant={member.role === "lead" ? "default" : "secondary"}
                          >
                            {member.role === "lead"
                              ? workCopy.teamRoleLead
                              : workCopy.teamRoleMember}
                          </Badge>
                        </ItemContent>
                        <ItemActions className="flex items-center gap-2 shrink-0">
                          <Select
                            value={member.role}
                            disabled={isPending}
                            onValueChange={(value) => {
                              const role = value as WorkMemberRole;
                              if (memberDepartmentId == null) return;
                              startTransition(async () => {
                                const result = await setWorkDepartmentMemberRole({
                                  departmentId: memberDepartmentId,
                                  userId: member.userId,
                                  role,
                                });
                                if (!result.success) {
                                  toast.error(
                                    result.error ?? workCopy.teamSaveFailed,
                                  );
                                  return;
                                }
                                toast.success(workCopy.save);
                                setReloadKey((k) => k + 1);
                                refreshPage();
                              });
                            }}
                          >
                            <SelectTrigger size={controlSize} className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="lead">
                                {workCopy.teamRoleLead}
                              </SelectItem>
                              <SelectItem value="member">
                                {workCopy.teamRoleMember}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            size={controlSize}
                            variant="outline"
                            disabled={isPending}
                            onClick={async () => {
                              if (memberDepartmentId == null) return;
                              const ok = await confirm({
                                title: workCopy.teamDeactivate,
                                description:
                                  workCopy.teamDeactivateConfirmDescription(
                                    member.fullName,
                                  ),
                                confirmText: workCopy.teamDeactivate,
                                variant: "destructive",
                              });
                              if (!ok) return;
                              startTransition(async () => {
                                const result = await deactivateWorkDepartmentMember({
                                  departmentId: memberDepartmentId,
                                  userId: member.userId,
                                });
                                if (!result.success) {
                                  toast.error(
                                    result.error ?? workCopy.teamSaveFailed,
                                  );
                                  return;
                                }
                                toast.success(workCopy.save);
                                setReloadKey((k) => k + 1);
                                refreshPage();
                              });
                            }}
                          >
                            {workCopy.teamDeactivate}
                          </Button>
                        </ItemActions>
                      </Item>
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </AppDialog>

      <FormDialog
        open={departmentDialogOpen}
        onOpenChange={setDepartmentDialogOpen}
        title={departmentDialogTitle}
        schema={departmentSchema}
        defaultValues={departmentDefaultValues}
        entityKey={editingDepartment?.id ?? "new"}
        submitLabel={workCopy.save}
        onSubmit={async (values: DepartmentValues) => {
          const result = await upsertWorkDepartment({
            name: values.name,
            departmentId: editingDepartment?.id,
          });
          if (!result.success) {
            return {
              success: false,
              error: result.error ?? workCopy.departmentCreateFailed,
            };
          }
          return { success: true };
        }}
        onSuccess={() => {
          refreshPage();
        }}
        successMessage={workCopy.save}
      >
        {(form) => (
          <AppFormGrid density="compact">
            <AppFormRow colSpan="full">
              <TextField
                control={form.control}
                name="name"
                label={workCopy.departmentNameLabel}
              />
            </AppFormRow>
          </AppFormGrid>
        )}
      </FormDialog>

      {memberDepartmentId != null ? (
        <WorkAddMembersDialog
          open={memberDialogOpen}
          onOpenChange={setMemberDialogOpen}
          departmentId={memberDepartmentId}
          departmentName={
            departments.find((d) => d.id === memberDepartmentId)?.name
          }
          candidates={candidates}
          onSuccess={() => {
            setReloadKey((k) => k + 1);
            refreshPage();
          }}
        />
      ) : null}
    </>
  );
}
