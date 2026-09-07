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
  ensurePilotDepartment,
  listWorkCandidateProfiles,
  listWorkTaskCreators,
  setWorkTaskCreator,
  upsertWorkDepartment,
  type WorkDepartmentOption,
  type WorkProfileOption,
} from "../actions";
import { WorkAddCreatorsDialog } from "./work-add-creators-dialog";

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
  const [creatorDialogOpen, setCreatorDialogOpen] = useState(false);
  const [creators, setCreators] = useState<WorkProfileOption[]>([]);
  const [candidates, setCandidates] = useState<WorkProfileOption[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [creatorSearchQuery, setCreatorSearchQuery] = useState("");

  const filteredCreators = useMemo(() => {
    const q = creatorSearchQuery.trim().toLowerCase();
    if (!q) return creators;
    return creators.filter((creator) =>
      creator.fullName.toLowerCase().includes(q),
    );
  }, [creators, creatorSearchQuery]);

  useEffect(() => {
    if (!open) return;
    setCreatorSearchQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) {
      setCreators([]);
      setCandidates([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [creatorsResult, candidatesResult] = await Promise.all([
        listWorkTaskCreators({}),
        listWorkCandidateProfiles({}),
      ]);
      if (cancelled) return;
      const nextCreators =
        creatorsResult.success && creatorsResult.data
          ? creatorsResult.data.items
          : [];
      const creatorIds = new Set(nextCreators.map((row) => row.id));
      const nextCandidates =
        candidatesResult.success && candidatesResult.data
          ? candidatesResult.data.items.filter((row) => !creatorIds.has(row.id))
          : [];
      setCreators(nextCreators);
      setCandidates(nextCandidates);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, reloadKey]);

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
            <TabsTrigger value="creators" className="gap-1.5">
              <span>{workCopy.settingsTabCreators}</span>
              <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                {creators.length}
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

          <TabsContent value="creators" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size={controlSize}
                onClick={() => setCreatorDialogOpen(true)}
                disabled={candidates.length === 0}
              >
                {workCopy.creatorsAdd}
              </Button>
              {creators.length > 3 ? (
                <Input
                  placeholder={workCopy.teamAddSearchPlaceholder}
                  value={creatorSearchQuery}
                  onChange={(event) => setCreatorSearchQuery(event.target.value)}
                  className="min-w-0 flex-1"
                />
              ) : null}
            </div>

            {creators.length === 0 ? (
              <AppEmptyState
                mode="no-data"
                description={workCopy.creatorsEmpty}
                compact
              />
            ) : filteredCreators.length === 0 ? (
              <AppEmptyState
                mode="no-data"
                description={workCopy.teamAddNoResults}
                compact
              />
            ) : (
              <div className={`max-h-80 overflow-y-auto pr-1 flex flex-col gap-2 ${WORK_LIST_ITEM_INSET}`}>
                {filteredCreators.map((creator) => (
                  <Item key={creator.id} variant="outline" className="p-2.5">
                    <ItemContent className="min-w-0 gap-1">
                      <ItemTitle className="truncate text-sm font-medium">
                        {creator.fullName}
                      </ItemTitle>
                    </ItemContent>
                    <ItemActions className="shrink-0">
                      <Button
                        type="button"
                        size={controlSize}
                        variant="outline"
                        disabled={isPending}
                        onClick={async () => {
                          const ok = await confirm({
                            title: workCopy.creatorsRemove,
                            description: workCopy.creatorsRemoveConfirm(
                              creator.fullName,
                            ),
                            confirmText: workCopy.creatorsRemove,
                            variant: "destructive",
                          });
                          if (!ok) return;
                          startTransition(async () => {
                            const result = await setWorkTaskCreator({
                              userId: creator.id,
                              active: false,
                            });
                            if (!result.success) {
                              toast.error(
                                result.error ?? workCopy.creatorSaveFailed,
                              );
                              return;
                            }
                            toast.success(workCopy.save);
                            setReloadKey((key) => key + 1);
                            refreshPage();
                          });
                        }}
                      >
                        {workCopy.creatorsRemove}
                      </Button>
                    </ItemActions>
                  </Item>
                ))}
              </div>
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

      <WorkAddCreatorsDialog
        open={creatorDialogOpen}
        onOpenChange={setCreatorDialogOpen}
        candidates={candidates}
        onSuccess={() => {
          setReloadKey((key) => key + 1);
          refreshPage();
        }}
      />
    </>
  );
}
