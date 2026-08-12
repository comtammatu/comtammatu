"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormDialog, SelectField } from "@/components/form";
import { AppEmptyState, AppListFrame, AppToolbar } from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";
import { workCopy } from "@lib/messages/work";
import {
  deactivateWorkDepartmentMember,
  setWorkDepartmentMemberRole,
  upsertWorkDepartmentMember,
  type WorkDepartmentMemberRow,
  type WorkDepartmentOption,
  type WorkMemberRole,
  type WorkProfileOption,
} from "../actions";

const addMemberSchema = z.object({
  userId: z.string().uuid({ error: workCopy.teamMemberLabel }),
  role: z.enum(["lead", "member"]),
});

type AddMemberValues = z.infer<typeof addMemberSchema>;

export function WorkTeamClient({
  departmentId,
  departments,
  members,
  candidates,
  canManage,
}: {
  departmentId: number;
  departments: WorkDepartmentOption[];
  members: WorkDepartmentMemberRow[];
  candidates: WorkProfileOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const controlSize = useFormControlSize();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const departmentName = useMemo(
    () =>
      departments.find((department) => department.id === departmentId)?.name ??
      workCopy.pilotDept,
    [departmentId, departments],
  );

  function replaceDepartment(nextId: number) {
    router.replace(`/work/team?department=${nextId}`);
  }

  return (
    <>
      <AppListFrame
        contentScroll
        toolbar={
          <AppToolbar variant="inline" className="flex-wrap gap-2">
            <Select
              value={String(departmentId)}
              onValueChange={(value) => replaceDepartment(Number(value))}
            >
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue placeholder={workCopy.scopeDepartment} />
              </SelectTrigger>
              <SelectContent>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={String(department.id)}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canManage ? (
              <Button
                size={controlSize}
                type="button"
                onClick={() => setOpen(true)}
                disabled={candidates.length === 0}
              >
                {workCopy.teamAdd}
              </Button>
            ) : null}
          </AppToolbar>
        }
      >
        {members.length === 0 ? (
          <AppEmptyState mode="no-data" description={workCopy.teamEmpty} />
        ) : (
          <div className="flex flex-col gap-2">
            {members.map((member) => (
              <Item key={member.id} variant="outline">
                <ItemContent className="gap-1">
                  <ItemTitle>{member.fullName}</ItemTitle>
                  <ItemDescription>
                    <Badge variant="secondary">
                      {member.role === "lead"
                        ? workCopy.teamRoleLead
                        : workCopy.teamRoleMember}
                    </Badge>
                  </ItemDescription>
                </ItemContent>
                {canManage ? (
                  <ItemActions className="flex flex-wrap gap-2">
                    <Select
                      value={member.role}
                      disabled={isPending}
                      onValueChange={(value) => {
                        const role = value as WorkMemberRole;
                        startTransition(async () => {
                          const result = await setWorkDepartmentMemberRole({
                            departmentId,
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
                          router.refresh();
                        });
                      }}
                    >
                      <SelectTrigger size="sm" className="w-36">
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
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await deactivateWorkDepartmentMember({
                            departmentId,
                            userId: member.userId,
                          });
                          if (!result.success) {
                            toast.error(
                              result.error ?? workCopy.teamSaveFailed,
                            );
                            return;
                          }
                          toast.success(workCopy.save);
                          router.refresh();
                        });
                      }}
                    >
                      {workCopy.teamDeactivate}
                    </Button>
                  </ItemActions>
                ) : null}
              </Item>
            ))}
          </div>
        )}
      </AppListFrame>

      {canManage ? (
        <FormDialog
          open={open}
          onOpenChange={setOpen}
          title={workCopy.teamAdd}
          description={departmentName}
          schema={addMemberSchema}
          defaultValues={{ userId: "", role: "member" }}
          submitLabel={workCopy.teamAdd}
          onSubmit={async (values: AddMemberValues) => {
            const result = await upsertWorkDepartmentMember({
              departmentId,
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
            router.refresh();
          }}
          successMessage={workCopy.save}
        >
          {(form) => (
            <>
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
            </>
          )}
        </FormDialog>
      ) : null}
    </>
  );
}
