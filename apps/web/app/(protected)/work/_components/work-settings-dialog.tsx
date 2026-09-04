"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
  SelectField,
  TextField,
} from "@/components/form";
import { AppDialog } from "@/components/form/form-dialog";
import { useFormControlSize } from "@/components/form/control-size";
import { AppEmptyState } from "@/components/surface";
import { workCopy } from "@lib/messages/work";
import { WORK_LIST_ITEM_INSET } from "../_lib/compose-styles";
import {
  deactivateWorkDepartment,
  ensurePilotDepartment,
  listWorkCandidateProfiles,
  listWorkDepartmentMembers,
  upsertWorkDepartment,
  upsertWorkDepartmentMember,
  type WorkDepartmentMemberRow,
  type WorkDepartmentOption,
  type WorkProfileOption,
} from "../actions";

const departmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["lead", "member"]),
});

type DepartmentValues = z.infer<typeof departmentSchema>;
type AddMemberValues = z.infer<typeof addMemberSchema>;

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

  useEffect(() => {
    if (!open) return;
    setMemberDepartmentId(departments[0]?.id ?? null);
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
  }, [open, memberDepartmentId]);

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
        contentClassName="max-w-lg"
      >
        <Tabs defaultValue="departments" className="flex flex-col gap-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="departments">
              {workCopy.settingsTabDepartments}
            </TabsTrigger>
            <TabsTrigger value="members">
              {workCopy.settingsTabMembers}
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
              <div className={`flex flex-col ${WORK_LIST_ITEM_INSET}`}>
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
                  <SelectTrigger size={controlSize} className="w-full">
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
                {members.length === 0 ? (
                  <AppEmptyState
                    mode="no-data"
                    description={workCopy.teamEmpty}
                    compact
                  />
                ) : (
                  <div className={`flex flex-col ${WORK_LIST_ITEM_INSET}`}>
                    {members.map((member) => (
                      <Item key={member.id} variant="outline">
                        <ItemContent className="gap-1">
                          <ItemTitle>{member.fullName}</ItemTitle>
                          <Badge variant="secondary">
                            {member.role === "lead"
                              ? workCopy.teamRoleLead
                              : workCopy.teamRoleMember}
                          </Badge>
                        </ItemContent>
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
        <FormDialog
          open={memberDialogOpen}
          onOpenChange={setMemberDialogOpen}
          title={workCopy.teamAdd}
          schema={addMemberSchema}
          defaultValues={{ userId: "", role: "member" }}
          submitLabel={workCopy.teamAdd}
          onSubmit={async (values: AddMemberValues) => {
            const result = await upsertWorkDepartmentMember({
              departmentId: memberDepartmentId,
              userId: values.userId,
              role: values.role,
            });
            if (!result.success) {
              return {
                success: false,
                error: result.error ?? workCopy.teamAddFailed,
              };
            }
            return { success: true };
          }}
          onSuccess={() => {
            refreshPage();
            setMemberDialogOpen(false);
          }}
          successMessage={workCopy.save}
        >
          {(form) => (
            <AppFormGrid density="compact">
              <SelectField
                control={form.control}
                name="userId"
                label={workCopy.teamMemberLabel}
                options={candidates.map((candidate) => ({
                  value: candidate.id,
                  label: candidate.fullName,
                }))}
              />
              <SelectField
                control={form.control}
                name="role"
                label={workCopy.teamRoleLabel}
                options={[
                  { value: "lead", label: workCopy.teamRoleLead },
                  { value: "member", label: workCopy.teamRoleMember },
                ]}
              />
            </AppFormGrid>
          )}
        </FormDialog>
      ) : null}
    </>
  );
}
