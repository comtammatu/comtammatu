"use client";

import { useRouter } from "next/navigation";
import { z } from "zod";
import type { UseFormReturn } from "react-hook-form";
import { FormDialog, SelectField } from "@/components/form";
import { workCopy } from "@lib/messages/work";
import type {
  WorkDepartmentOption,
  WorkProjectOption,
} from "../../actions";
import { workHref, type ParsedWorkParams } from "../../_lib/params";

const scopeSchema = z
  .object({
    scopeKind: z.enum(["mine", "department", "project"]),
    departmentId: z.string().optional(),
    projectId: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.scopeKind === "department" && !values.departmentId) {
      ctx.addIssue({
        code: "custom",
        message: workCopy.boardNeedsScope,
        path: ["departmentId"],
      });
    }
    if (values.scopeKind === "project" && !values.projectId) {
      ctx.addIssue({
        code: "custom",
        message: workCopy.timelineNeedsScope,
        path: ["projectId"],
      });
    }
  });

type ScopeValues = z.infer<typeof scopeSchema>;

export type WorkScopeDialogMode =
  | "board-or-project"
  | "project-only"
  | "optional";

function defaultScopeValues(
  params: ParsedWorkParams,
  mode: WorkScopeDialogMode,
): ScopeValues {
  if (params.projectId != null) {
    return {
      scopeKind: "project",
      departmentId: "",
      projectId: String(params.projectId),
    };
  }
  if (params.departmentId != null) {
    return {
      scopeKind: "department",
      departmentId: String(params.departmentId),
      projectId: "",
    };
  }
  return {
    scopeKind: mode === "project-only" ? "project" : "mine",
    departmentId: "",
    projectId: "",
  };
}

export function WorkScopeDialog({
  open,
  onOpenChange,
  params,
  departments,
  projects,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  params: ParsedWorkParams;
  departments: WorkDepartmentOption[];
  projects: WorkProjectOption[];
  mode: WorkScopeDialogMode;
}) {
  const router = useRouter();

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={workCopy.scopeDialogTitle}
      schema={scopeSchema}
      defaultValues={defaultScopeValues(params, mode)}
      entityKey={`${params.view}-${params.departmentId ?? ""}-${params.projectId ?? ""}-${mode}`}
      submitLabel={workCopy.scopeDialogSubmit}
      onSubmit={async (values: ScopeValues) => {
        if (values.scopeKind === "mine") {
          router.replace(
            workHref(params, { departmentId: null, projectId: null }),
          );
          return { success: true };
        }
        if (values.scopeKind === "department") {
          router.replace(
            workHref(params, {
              departmentId: Number(values.departmentId),
              projectId: null,
            }),
          );
          return { success: true };
        }
        router.replace(
          workHref(params, {
            projectId: Number(values.projectId),
            departmentId: null,
          }),
        );
        return { success: true };
      }}
      onSuccess={() => {
        onOpenChange(false);
        router.refresh();
      }}
    >
      {(form) => (
        <ScopeFields
          form={form}
          mode={mode}
          departments={departments}
          projects={projects}
        />
      )}
    </FormDialog>
  );
}

function ScopeFields({
  form,
  mode,
  departments,
  projects,
}: {
  form: UseFormReturn<ScopeValues>;
  mode: WorkScopeDialogMode;
  departments: WorkDepartmentOption[];
  projects: WorkProjectOption[];
}) {
  const scopeKind =
    mode === "project-only" ? "project" : form.watch("scopeKind");

  const scopeOptions =
    mode === "optional"
      ? [
          { value: "mine", label: workCopy.scopeClear },
          { value: "department", label: workCopy.scopeDepartment },
          { value: "project", label: workCopy.scopeProject },
        ]
      : [
          { value: "department", label: workCopy.scopeDepartment },
          { value: "project", label: workCopy.scopeProject },
        ];

  return (
    <>
      {mode === "optional" || mode === "board-or-project" ? (
        <SelectField
          control={form.control}
          name="scopeKind"
          label={workCopy.pickScope}
          options={scopeOptions}
        />
      ) : null}
      {scopeKind === "department" ? (
        <SelectField
          control={form.control}
          name="departmentId"
          label={workCopy.scopeDepartment}
          options={departments.map((department) => ({
            value: String(department.id),
            label: department.name,
          }))}
        />
      ) : null}
      {scopeKind === "project" ? (
        <SelectField
          control={form.control}
          name="projectId"
          label={workCopy.scopeProject}
          options={
            projects.length > 0
              ? projects.map((project) => ({
                  value: String(project.id),
                  label: project.name,
                }))
              : [{ value: "missing", label: workCopy.scopeProjectsEmpty }]
          }
        />
      ) : null}
    </>
  );
}
