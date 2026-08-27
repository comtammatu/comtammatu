"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check as IconCheck,
  ChevronRight as IconChevronRight,
  ClipboardCheck as IconClipboardCheck,
  FileText as IconFileText,
  Pencil as IconPencil,
  Plus as IconPlus,
  Search as IconSearch,
  Sparkles as IconSparkles,
  Trash2 as IconTrash,
  Users as IconUsers,
  X as IconX,
} from "lucide-react";
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { formatVNClockTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Input } from "@comtammatu/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppBackLink, AppEmptyState, AppSheet } from "@/components/surface";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  deleteCountTemplate,
  saveCountTemplate,
  setCountAssignments,
  setStationCountAssignments,
} from "@/(protected)/inventory/count-assignments/actions";
import type {
  BranchCountAssignmentData,
  CountAssignmentEmployee,
  CountTemplate,
} from "@lib/inventory/count-assignment-model";
import { matchesSearch } from "@lib/search";

const ALL_SHIFTS_VALUE = "all";
const ALL_ROLES_VALUE = "all";

function seedSelections(data: BranchCountAssignmentData) {
  const seeded: Record<string, number[]> = {};
  for (const employee of data.employees) {
    seeded[String(employee.id)] =
      data.assignmentsByEmployee[String(employee.id)] ?? [];
  }
  return seeded;
}

export function BranchCountAssignmentsClient({
  data,
}: {
  data: BranchCountAssignmentData;
}) {
  const router = useRouter();
  const basePath = `/br/${data.branchId}/stock/count-assignments`;
  const [isPending, startTransition] = useTransition();
  const [selectionByEmployee, setSelectionByEmployee] = useState<
    Record<string, number[]>
  >(() => seedSelections(data));

  // Single employee sheet state
  const [activeEmployeeId, setActiveEmployeeId] = useState<number | null>(null);
  const [draftIds, setDraftIds] = useState<number[]>([]);
  const [query, setQuery] = useState("");

  // Staff roster filtering
  const [staffSearch, setStaffSearch] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState(ALL_ROLES_VALUE);

  // Station Matrix Assignment Sheet state
  const [activeStationTemplateId, setActiveStationTemplateId] = useState<
    number | null
  >(null);
  const [stationStaffIds, setStationStaffIds] = useState<number[]>([]);
  const [stationAssignmentsDraft, setStationAssignmentsDraft] = useState<
    Record<number, number | null>
  >({});
  const [stationCandidateEmpId, setStationCandidateEmpId] = useState<string>("");

  // Station Template Editor Sheet state
  const [editingTemplate, setEditingTemplate] = useState<
    CountTemplate | "new" | null
  >(null);
  const [templateDraftName, setTemplateDraftName] = useState("");
  const [templateDraftRole, setTemplateDraftRole] = useState("custom");
  const [templateDraftIngredientIds, setTemplateDraftIngredientIds] = useState<
    number[]
  >([]);
  const [templateIngredientQuery, setTemplateIngredientQuery] = useState("");

  const activeEmployee = data.employees.find(
    (employee) => employee.id === activeEmployeeId,
  );

  const ingredientById = useMemo(
    () =>
      new Map(
        data.ingredients.map((ingredient) => [ingredient.id, ingredient]),
      ),
    [data.ingredients],
  );

  const employeeById = useMemo(
    () =>
      new Map(
        data.employees.map((employee) => [employee.id, employee]),
      ),
    [data.employees],
  );

  const visibleIngredients = useMemo(() => {
    const normalized = query.trim();
    if (!normalized) return data.ingredients;
    return data.ingredients.filter((ingredient) =>
      matchesSearch([ingredient.name, ingredient.unit], normalized),
    );
  }, [data.ingredients, query]);

  const availableRoles = useMemo(() => {
    const roles = new Set<string>();
    for (const emp of data.employees) {
      if (emp.positionName) {
        roles.add(emp.positionName);
      }
    }
    return Array.from(roles);
  }, [data.employees]);

  const filteredEmployees = useMemo(() => {
    const searchNormalized = staffSearch.trim();
    return data.employees.filter((emp) => {
      const matchRole =
        selectedRoleFilter === ALL_ROLES_VALUE ||
        emp.positionName === selectedRoleFilter;
      const matchSearch =
        !searchNormalized ||
        matchesSearch([emp.name, emp.positionName ?? ""], searchNormalized);
      return matchRole && matchSearch;
    });
  }, [data.employees, selectedRoleFilter, staffSearch]);

  const assignedEmployeeCount = Object.values(selectionByEmployee).filter(
    (ids) => ids.length > 0,
  ).length;

  const orderedEmployees = useMemo(() => {
    return [...filteredEmployees].sort((left, right) => {
      const leftAssigned =
        (selectionByEmployee[String(left.id)]?.length ?? 0) > 0;
      const rightAssigned =
        (selectionByEmployee[String(right.id)]?.length ?? 0) > 0;
      return (
        Number(rightAssigned) - Number(leftAssigned) ||
        left.name.localeCompare(right.name, "vi")
      );
    });
  }, [filteredEmployees, selectionByEmployee]);

  useEffect(() => {
    setSelectionByEmployee(seedSelections(data));
  }, [data]);

  // Active Station being assigned
  const activeStation = useMemo(
    () =>
      data.templates.find((t) => t.id === activeStationTemplateId) ?? null,
    [data.templates, activeStationTemplateId],
  );

  function openStationAssignment(template: CountTemplate) {
    setActiveStationTemplateId(template.id);
    const currentDraft: Record<number, number | null> = {};
    const existingStaff = new Set<number>();

    for (const ingId of template.ingredientIds) {
      let assignedEmpId: number | null = null;
      for (const [empIdStr, ids] of Object.entries(selectionByEmployee)) {
        if (ids.includes(ingId)) {
          assignedEmpId = Number(empIdStr);
          existingStaff.add(assignedEmpId);
          break;
        }
      }
      currentDraft[ingId] = assignedEmpId;
    }

    if (existingStaff.size === 0) {
      const matchingStaff = data.employees.filter((emp) => {
        if (template.stationRole === "cashier_waiter") {
          return emp.positionCode === "cashier" || emp.positionCode === "waiter";
        }
        if (template.stationRole === "grill_station") {
          return emp.positionCode === "grill" || emp.positionCode === "kitchen";
        }
        if (template.stationRole === "kitchen") {
          return emp.positionCode === "kitchen" || emp.positionCode === "cook";
        }
        return false;
      });
      for (const emp of matchingStaff) {
        existingStaff.add(emp.id);
      }
    }

    setStationStaffIds(Array.from(existingStaff));
    setStationAssignmentsDraft(currentDraft);
    setStationCandidateEmpId("");
  }

  function closeStationAssignment() {
    setActiveStationTemplateId(null);
    setStationStaffIds([]);
    setStationAssignmentsDraft({});
    setStationCandidateEmpId("");
  }

  function addStaffToStation(empId: number) {
    if (!stationStaffIds.includes(empId)) {
      setStationStaffIds((prev) => [...prev, empId]);
    }
    setStationCandidateEmpId("");
  }

  function removeStaffFromStation(empId: number) {
    setStationStaffIds((prev) => prev.filter((id) => id !== empId));
    setStationAssignmentsDraft((prev) => {
      const next = { ...prev };
      for (const [ingIdStr, currentOwnerId] of Object.entries(next)) {
        if (currentOwnerId === empId) {
          next[Number(ingIdStr)] = null;
        }
      }
      return next;
    });
  }

  function assignAllStationItemsTo(empId: number) {
    if (!activeStation) return;
    const next: Record<number, number | null> = {};
    for (const ingId of activeStation.ingredientIds) {
      next[ingId] = empId;
    }
    setStationAssignmentsDraft(next);
  }

  function splitStationItemsEvenly() {
    if (!activeStation || stationStaffIds.length === 0) return;
    const next: Record<number, number | null> = {};
    activeStation.ingredientIds.forEach((ingId, index) => {
      const targetEmpId = stationStaffIds[index % stationStaffIds.length]!;
      next[ingId] = targetEmpId;
    });
    setStationAssignmentsDraft(next);
  }

  function clearStationAssignments() {
    if (!activeStation) return;
    const next: Record<number, number | null> = {};
    for (const ingId of activeStation.ingredientIds) {
      next[ingId] = null;
    }
    setStationAssignmentsDraft(next);
  }

  function saveStationAssignment() {
    if (!activeStation || data.selectedLocationId == null) return;

    const payloadAssignments = stationStaffIds.map((empId) => ({
      employeeId: empId,
      ingredientIds: activeStation.ingredientIds.filter(
        (id) => stationAssignmentsDraft[id] === empId,
      ),
    }));

    startTransition(async () => {
      const result = await setStationCountAssignments({
        branchId: data.branchId,
        locationId: data.selectedLocationId as number,
        shiftId: data.selectedShiftId,
        templateId: activeStation.id,
        assignments: payloadAssignments,
      });

      if (!result.success) {
        toast.error(result.error ?? INVENTORY_VI.countStationSaveFailed);
        return;
      }

      toast.success(INVENTORY_VI.countStationSaveSuccess);
      closeStationAssignment();
      router.refresh();
    });
  }

  // Template Editor Actions
  function openTemplateEditor(template: CountTemplate | "new") {
    setEditingTemplate(template);
    if (template === "new") {
      setTemplateDraftName("");
      setTemplateDraftRole("custom");
      setTemplateDraftIngredientIds([]);
    } else {
      setTemplateDraftName(template.name);
      setTemplateDraftRole(template.stationRole);
      setTemplateDraftIngredientIds([...template.ingredientIds]);
    }
    setTemplateIngredientQuery("");
  }

  function closeTemplateEditor() {
    setEditingTemplate(null);
    setTemplateDraftName("");
    setTemplateDraftRole("custom");
    setTemplateDraftIngredientIds([]);
    setTemplateIngredientQuery("");
  }

  function toggleTemplateIngredient(ingredientId: number) {
    setTemplateDraftIngredientIds((current) =>
      current.includes(ingredientId)
        ? current.filter((id) => id !== ingredientId)
        : [...current, ingredientId],
    );
  }

  function saveTemplate() {
    if (!templateDraftName.trim()) return;

    startTransition(async () => {
      const result = await saveCountTemplate({
        branchId: data.branchId,
        templateId:
          editingTemplate && editingTemplate !== "new"
            ? editingTemplate.id
            : undefined,
        code:
          editingTemplate && editingTemplate !== "new"
            ? editingTemplate.code
            : undefined,
        name: templateDraftName.trim(),
        stationRole: templateDraftRole,
        ingredientIds: templateDraftIngredientIds,
      });

      if (!result.success) {
        toast.error(result.error ?? INVENTORY_VI.countAssignSaveFailed);
        return;
      }

      toast.success(INVENTORY_VI.countTemplateSaveSuccess);
      closeTemplateEditor();
      router.refresh();
    });
  }

  function handleDeleteTemplate() {
    if (!editingTemplate || editingTemplate === "new" || editingTemplate.isSystem) {
      return;
    }

    startTransition(async () => {
      const result = await deleteCountTemplate({
        branchId: data.branchId,
        templateId: editingTemplate.id,
      });

      if (!result.success) {
        toast.error(result.error ?? INVENTORY_VI.countAssignSaveFailed);
        return;
      }

      toast.success(INVENTORY_VI.countTemplateDeleteSuccess);
      closeTemplateEditor();
      router.refresh();
    });
  }

  // Single Employee Sheet Actions
  function openEmployee(employee: CountAssignmentEmployee) {
    setActiveEmployeeId(employee.id);
    setDraftIds(selectionByEmployee[String(employee.id)] ?? []);
    setQuery("");
  }

  function closeEditor() {
    setActiveEmployeeId(null);
    setDraftIds([]);
    setQuery("");
  }

  function toggleIngredient(ingredientId: number) {
    setDraftIds((current) =>
      current.includes(ingredientId)
        ? current.filter((id) => id !== ingredientId)
        : [...current, ingredientId],
    );
  }

  function saveAssignment() {
    if (!activeEmployee || data.selectedLocationId == null) {
      return;
    }
    const nextIds = [...draftIds];
    startTransition(async () => {
      const result = await setCountAssignments({
        branchId: data.branchId,
        locationId: data.selectedLocationId as number,
        employeeId: activeEmployee.id,
        shiftId: data.selectedShiftId,
        ingredientIds: nextIds,
      });
      if (!result.success) {
        toast.error(result.error ?? INVENTORY_VI.countAssignSaveFailed);
        return;
      }
      setSelectionByEmployee((current) => ({
        ...current,
        [String(activeEmployee.id)]: nextIds,
      }));
      toast.success(
        INVENTORY_VI.countAssignSaved(activeEmployee.name, nextIds.length),
      );
      closeEditor();
      router.refresh();
    });
  }

  function replaceScope(
    nextLocationId: number | null,
    nextShiftId: number | null,
  ) {
    const params = new URLSearchParams();
    if (nextLocationId != null) params.set("locationId", String(nextLocationId));
    if (nextShiftId != null) params.set("shiftId", String(nextShiftId));
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${basePath}?${nextQuery}` : basePath);
  }

  const content = (
    <div className="flex flex-col gap-4">
      {/* Scope pickers: Location & Shift */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="branch-count-assignment-location">
            {INVENTORY_VI.warehouseShort}
          </Label>
          <Select
            value={
              data.selectedLocationId == null
                ? ""
                : String(data.selectedLocationId)
            }
            onValueChange={(value) =>
              replaceScope(Number(value), data.selectedShiftId)
            }
          >
            <SelectTrigger
              id="branch-count-assignment-location"
              size="touch"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.locationOptions.map((location) => (
                <SelectItem
                  key={location.id}
                  value={String(location.id)}
                  size="touch"
                >
                  {location.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {data.shiftOptions.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="branch-count-assignment-shift">
              {INVENTORY_VI.countAssignShiftLabel}
            </Label>
            <Select
              value={
                data.selectedShiftId == null
                  ? ALL_SHIFTS_VALUE
                  : String(data.selectedShiftId)
              }
              onValueChange={(value) =>
                replaceScope(
                  data.selectedLocationId,
                  value === ALL_SHIFTS_VALUE ? null : Number(value),
                )
              }
            >
              <SelectTrigger
                id="branch-count-assignment-shift"
                size="touch"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SHIFTS_VALUE} size="touch">
                  {INVENTORY_VI.countAssignAllShifts}
                </SelectItem>
                {data.shiftOptions.map((shift) => (
                  <SelectItem
                    key={shift.id}
                    value={String(shift.id)}
                    size="touch"
                  >
                    {shift.name} · {formatVNClockTime(shift.startTime)}-
                    {formatVNClockTime(shift.endTime)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {/* SECTION 1: Station Role Templates */}
      {data.selectedLocationId != null ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {INVENTORY_VI.countAssignStationTitle}
              </span>
              <Badge variant="outline">
                {INVENTORY_VI.countAssignTemplatesCount(data.templates.length)}
              </Badge>
            </div>
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={() => openTemplateEditor("new")}
            >
              <IconPlus className="size-4" />
              {INVENTORY_VI.countStationCreateTemplateAction}
            </Button>
          </div>

          <ItemGroup className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {data.templates.map((template) => {
              const assignedEmpCounts: Record<number, number> = {};
              for (const ingId of template.ingredientIds) {
                for (const [empIdStr, ids] of Object.entries(
                  selectionByEmployee,
                )) {
                  if (ids.includes(ingId)) {
                    const empId = Number(empIdStr);
                    assignedEmpCounts[empId] =
                      (assignedEmpCounts[empId] ?? 0) + 1;
                    break;
                  }
                }
              }
              const assignedStaffList = Object.entries(assignedEmpCounts).map(
                ([empIdStr, count]) => ({
                  employee: employeeById.get(Number(empIdStr)),
                  count,
                }),
              );

              return (
                <Item
                  key={template.id}
                  variant="outline"
                  className="flex-col items-stretch justify-between gap-3 p-3"
                >
                  <ItemContent className="min-w-0 gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <ItemTitle size="heading">{template.name}</ItemTitle>
                      <Badge variant="secondary">
                        {INVENTORY_VI.countAssignItemCount(
                          template.ingredientIds.length,
                        )}
                      </Badge>
                    </div>

                    <ItemDescription className="line-clamp-none flex flex-wrap gap-1">
                      {template.ingredientIds.slice(0, 3).map((id) => (
                        <Badge
                          key={id}
                          variant="outline"
                          className="max-w-32 truncate text-xs text-muted-foreground"
                          title={ingredientById.get(id)?.name}
                        >
                          {ingredientById.get(id)?.name ?? `#${id}`}
                        </Badge>
                      ))}
                      {template.ingredientIds.length > 3 ? (
                        <Badge
                          variant="outline"
                          className="text-xs text-muted-foreground"
                        >
                          +{INVENTORY_VI.countAssignItemCount(
                            template.ingredientIds.length - 3,
                          )}
                        </Badge>
                      ) : null}
                    </ItemDescription>

                    {/* Assigned staff breakdown */}
                    <div className="flex flex-wrap items-center gap-1 pt-1 text-xs">
                      {assignedStaffList.length > 0 ? (
                        assignedStaffList.map(({ employee, count }) => (
                          <Badge
                            key={employee?.id ?? Math.random()}
                            variant="success"
                            className="text-xs"
                          >
                            <IconUsers className="mr-1 size-3" />
                            {employee?.name ?? "—"}:{" "}
                            {INVENTORY_VI.countAssignItemCount(count)}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {INVENTORY_VI.countStationUnassigned}
                        </span>
                      )}
                    </div>
                  </ItemContent>

                  <div className="flex items-center gap-2 border-t pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
                      className="flex-1"
                      onClick={() => openTemplateEditor(template)}
                    >
                      <IconPencil className="size-3.5" />
                      {INVENTORY_VI.countStationEditAction}
                    </Button>
                    <Button
                      type="button"
                      size="touch"
                      className="flex-1"
                      onClick={() => openStationAssignment(template)}
                    >
                      <IconUsers className="size-3.5" />
                      {INVENTORY_VI.countStationAssignAction}
                    </Button>
                  </div>
                </Item>
              );
            })}
          </ItemGroup>
        </div>
      ) : null}

      {/* SECTION 2: Staff Roster Overview */}
      <div className="flex flex-col gap-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {INVENTORY_VI.staffRosterTitle}
            </span>
            <span className="text-xs text-muted-foreground">
              {INVENTORY_VI.staffRosterDescription}
            </span>
          </div>
        </div>

        {/* Role Filter & Search */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <InputGroup className="min-h-12 flex-1">
            <InputGroupAddon>
              <IconSearch className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
              aria-label={INVENTORY_VI.staffSearchPlaceholder}
              name="staffSearch"
              type="search"
              autoComplete="off"
              value={staffSearch}
              onChange={(e) => setStaffSearch(e.target.value)}
              placeholder={INVENTORY_VI.staffSearchPlaceholder}
              inputMode="search"
            />
          </InputGroup>

          {availableRoles.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                variant={
                  selectedRoleFilter === ALL_ROLES_VALUE ? "default" : "outline"
                }
                size="touch"
                onClick={() => setSelectedRoleFilter(ALL_ROLES_VALUE)}
              >
                {INVENTORY_VI.roleFilterAll}
              </Button>
              {availableRoles.map((role) => (
                <Button
                  key={role}
                  type="button"
                  variant={
                    selectedRoleFilter === role ? "default" : "outline"
                  }
                  size="touch"
                  onClick={() => setSelectedRoleFilter(role)}
                >
                  {role}
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        {data.selectedLocationId == null ? (
          <AppEmptyState
            compact
            mode="no-data"
            icon={<IconClipboardCheck />}
            title={INVENTORY_VI.countAssignNoWarehouseTitle}
            description={INVENTORY_VI.countAssignNoWarehouseDescription}
          />
        ) : orderedEmployees.length === 0 ? (
          <AppEmptyState
            compact
            mode="no-results"
            title={INVENTORY_VI.noStaffMatches}
          />
        ) : (
          <ItemGroup className="grid gap-2 lg:grid-cols-2">
            {orderedEmployees.map((employee) => {
              const selectedIds =
                selectionByEmployee[String(employee.id)] ?? [];
              return (
                <Item
                  key={employee.id}
                  variant="outline"
                  className="min-h-20 min-w-0 flex-nowrap touch-manipulation"
                  render={
                    <button
                      type="button"
                      onClick={() => openEmployee(employee)}
                    />
                  }
                >
                  <ItemContent className="min-w-0 gap-1 text-left">
                    <div className="flex items-center gap-2">
                      <ItemTitle size="heading">{employee.name}</ItemTitle>
                      {employee.positionName ? (
                        <Badge variant="outline" className="text-xs">
                          {employee.positionName}
                        </Badge>
                      ) : null}
                    </div>
                    <ItemDescription className="line-clamp-none flex flex-wrap gap-1">
                      {selectedIds.slice(0, 4).map((ingredientId) => {
                        const ingredientName =
                          ingredientById.get(ingredientId)?.name ??
                          `#${ingredientId}`;
                        return (
                          <Badge
                            key={ingredientId}
                            variant="secondary"
                            className="min-w-0 max-w-full sm:max-w-48"
                            aria-label={ingredientName}
                            title={ingredientName}
                          >
                            <span className="min-w-0 truncate">
                              {ingredientName}
                            </span>
                          </Badge>
                        );
                      })}
                      {selectedIds.length > 4 ? (
                        <Badge variant="secondary">
                          +{selectedIds.length - 4}
                        </Badge>
                      ) : null}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Badge
                      variant={selectedIds.length > 0 ? "success" : "outline"}
                    >
                      {selectedIds.length}
                    </Badge>
                    <IconChevronRight className="size-4 text-muted-foreground" />
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        )}
      </div>
    </div>
  );

  const panel = (
    <BranchOperatorPanel
      title={INVENTORY_VI.countAssignTitle}
      description={INVENTORY_VI.countAssignDescription}
      icon={IconClipboardCheck}
      badge={{
        children: INVENTORY_VI.countAssignAssignedSummary(
          assignedEmployeeCount,
          data.employees.length,
        ),
      }}
      size="sm"
    >
      <Button
        variant="outline"
        size="touch"
        className="w-full"
        render={<Link href={`/br/${data.branchId}/stock/count-slips`} />}
      >
        <IconFileText className="size-4" />
        {INVENTORY_VI.countSlipTitle}
      </Button>
      {content}
    </BranchOperatorPanel>
  );

  const page = (
    <BranchOperatorPage
      title={INVENTORY_VI.countAssignTitle}
      description={data.branchName}
      back={<AppBackLink href={`/br/${data.branchId}/stock`} />}
    >
      {panel}
    </BranchOperatorPage>
  );

  const templateVisibleIngredients = useMemo(() => {
    const normalized = templateIngredientQuery.trim();
    if (!normalized) return data.ingredients;
    return data.ingredients.filter((ingredient) =>
      matchesSearch([ingredient.name, ingredient.unit], normalized),
    );
  }, [data.ingredients, templateIngredientQuery]);

  const candidateStationEmployees = useMemo(() => {
    return data.employees.filter((emp) => !stationStaffIds.includes(emp.id));
  }, [data.employees, stationStaffIds]);

  return (
    <>
      {page}

      {/* ─── 1. Station Assignment Sheet ──────────────────────────────── */}
      <AppSheet
        open={activeStationTemplateId != null}
        onOpenChange={(open) => {
          if (!open) closeStationAssignment();
        }}
        title={
          activeStation
            ? INVENTORY_VI.countStationAssignSheetTitle(activeStation.name)
            : ""
        }
        description={INVENTORY_VI.countStationAssignSheetDescription}
        side="bottom"
        showCloseButton={false}
        contentClassName="max-h-dvh-95 overflow-hidden bg-background"
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={isPending}
              onClick={closeStationAssignment}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="button"
              size="touch-lg"
              disabled={isPending || !activeStation}
              onClick={saveStationAssignment}
            >
              {isPending ? <Spinner className="size-5" /> : null}
              {ACTIONS_VI.save}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 px-3 pb-2 sm:px-4">
          {/* Station Staff Section */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              {INVENTORY_VI.countStationStaffTitle} ({stationStaffIds.length})
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {stationStaffIds.map((empId) => {
                const emp = employeeById.get(empId);
                return (
                  <Badge
                    key={empId}
                    variant="secondary"
                    className="flex items-center gap-1 py-1 pr-1 text-sm"
                  >
                    <span>{emp?.name ?? `#${empId}`}</span>
                    {emp?.positionName ? (
                      <span className="text-xs text-muted-foreground">
                        ({emp.positionName})
                      </span>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="touch"
                      aria-label={ACTIONS_VI.delete}
                      className="size-5 min-h-0 min-w-0 rounded-full p-0"
                      onClick={() => removeStaffFromStation(empId)}
                    >
                      <IconX className="size-3" />
                    </Button>
                  </Badge>
                );
              })}

              {candidateStationEmployees.length > 0 ? (
                <Select
                  value={stationCandidateEmpId}
                  onValueChange={(val) => {
                    if (val) addStaffToStation(Number(val));
                  }}
                >
                  <SelectTrigger size="touch" className="h-8 min-w-40 text-xs">
                    <SelectValue
                      placeholder={
                        INVENTORY_VI.countStationSelectStaffPlaceholder
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {candidateStationEmployees.map((emp) => (
                      <SelectItem
                        key={emp.id}
                        value={String(emp.id)}
                        size="touch"
                      >
                        {emp.name}{" "}
                        {emp.positionName ? `(${emp.positionName})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          </div>

          {/* Quick Action Shortcuts */}
          {stationStaffIds.length > 0 && activeStation ? (
            <div className="flex flex-wrap gap-2 border-t pt-2">
              {stationStaffIds.map((empId) => {
                const emp = employeeById.get(empId);
                return (
                  <Button
                    key={empId}
                    type="button"
                    variant="outline"
                    size="touch"
                    className="text-xs"
                    onClick={() => assignAllStationItemsTo(empId)}
                  >
                    {INVENTORY_VI.countStationAssignAllTo(emp?.name ?? "")}
                  </Button>
                );
              })}
              {stationStaffIds.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="text-xs"
                  onClick={splitStationItemsEvenly}
                >
                  <IconSparkles className="size-3.5" />
                  {INVENTORY_VI.countStationSplitEvenly}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="touch"
                className="text-xs text-destructive"
                onClick={clearStationAssignments}
              >
                {INVENTORY_VI.countStationClearAssignments}
              </Button>
            </div>
          ) : null}
        </div>

        {/* Station Ingredients Matrix List */}
        <ScrollArea className="min-h-0 flex-1 px-3 sm:px-4">
          <div className="flex flex-col gap-2 pb-4 pr-2">
            {activeStation?.ingredientIds.map((ingId) => {
              const ing = ingredientById.get(ingId);
              const currentEmpId = stationAssignmentsDraft[ingId] ?? null;

              return (
                <Item
                  key={ingId}
                  variant="outline"
                  className="flex-col items-start gap-2 p-3"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-medium">{ing?.name ?? `#${ingId}`}</span>
                    {ing?.unit ? (
                      <Badge variant="outline" className="text-xs">
                        {ing.unit}
                      </Badge>
                    ) : null}
                  </div>

                  {/* Assignee Picker for this specific item */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Button
                      type="button"
                      variant={currentEmpId === null ? "default" : "outline"}
                      size="touch"
                      className="h-8 text-xs"
                      onClick={() =>
                        setStationAssignmentsDraft((prev) => ({
                          ...prev,
                          [ingId]: null,
                        }))
                      }
                    >
                      {INVENTORY_VI.countStationUnassigned}
                    </Button>
                    {stationStaffIds.map((empId) => {
                      const emp = employeeById.get(empId);
                      const isSelected = currentEmpId === empId;
                      return (
                        <Button
                          key={empId}
                          type="button"
                          variant={isSelected ? "default" : "outline"}
                          size="touch"
                          className="h-8 text-xs"
                          onClick={() =>
                            setStationAssignmentsDraft((prev) => ({
                              ...prev,
                              [ingId]: empId,
                            }))
                          }
                        >
                          {isSelected ? <IconCheck className="size-3" /> : null}
                          {emp?.name ?? `#${empId}`}
                        </Button>
                      );
                    })}
                  </div>
                </Item>
              );
            })}
          </div>
        </ScrollArea>
      </AppSheet>

      {/* ─── 2. Station Template Editor Sheet ─────────────────────────── */}
      <AppSheet
        open={editingTemplate != null}
        onOpenChange={(open) => {
          if (!open) closeTemplateEditor();
        }}
        title={INVENTORY_VI.countTemplateEditorSheetTitle(
          editingTemplate !== "new",
        )}
        description={INVENTORY_VI.countTemplateEditorSheetDescription}
        side="bottom"
        showCloseButton={false}
        contentClassName="max-h-dvh-95 overflow-hidden bg-background"
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        footer={
          <>
            {editingTemplate &&
            editingTemplate !== "new" &&
            !editingTemplate.isSystem ? (
              <Button
                type="button"
                variant="destructive"
                size="touch"
                disabled={isPending}
                onClick={handleDeleteTemplate}
              >
                <IconTrash className="size-4" />
                {INVENTORY_VI.countTemplateDeleteAction}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={isPending}
              onClick={closeTemplateEditor}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="button"
              size="touch-lg"
              disabled={isPending || !templateDraftName.trim()}
              onClick={saveTemplate}
            >
              {isPending ? <Spinner className="size-5" /> : null}
              {ACTIONS_VI.save}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 px-3 pb-3 sm:px-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="templateDraftName">
              {INVENTORY_VI.countTemplateNameLabel}
            </Label>
            <Input
              id="templateDraftName"
              value={templateDraftName}
              onChange={(e) => setTemplateDraftName(e.target.value)}
              placeholder={INVENTORY_VI.countTemplateNamePlaceholder}
              autoComplete="off"
            />
          </div>

          <div className="flex items-center justify-between border-t pt-2">
            <span className="text-xs font-semibold text-muted-foreground">
              {INVENTORY_VI.countAssignItemCount(
                templateDraftIngredientIds.length,
              )}
            </span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="h-8 text-xs"
                onClick={() =>
                  setTemplateDraftIngredientIds(
                    data.ingredients.map((i) => i.id),
                  )
                }
              >
                {INVENTORY_VI.countTemplateSelectAll}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="h-8 text-xs"
                onClick={() => setTemplateDraftIngredientIds([])}
              >
                {INVENTORY_VI.countTemplateDeselectAll}
              </Button>
            </div>
          </div>

          <InputGroup className="min-h-12">
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput
              aria-label={INVENTORY_VI.countAssignSearchPlaceholder}
              name="templateIngredientSearch"
              type="search"
              autoComplete="off"
              value={templateIngredientQuery}
              onChange={(e) => setTemplateIngredientQuery(e.target.value)}
              placeholder={INVENTORY_VI.countAssignSearchPlaceholder}
              inputMode="search"
            />
          </InputGroup>
        </div>

        <ScrollArea className="min-h-0 flex-1 px-3 sm:px-4">
          <div className="flex flex-col gap-2 pb-4 pr-2">
            {templateVisibleIngredients.map((ingredient) => {
              const checked = templateDraftIngredientIds.includes(
                ingredient.id,
              );
              return (
                <Item
                  key={ingredient.id}
                  variant={checked ? "muted" : "outline"}
                  className="min-h-14 cursor-pointer"
                  onClick={() => toggleTemplateIngredient(ingredient.id)}
                >
                  <Checkbox
                    size="touch"
                    checked={checked}
                    disabled={isPending}
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  <ItemContent className="min-w-0">
                    <span className="break-words font-medium">
                      {ingredient.name}
                    </span>
                    {ingredient.unit ? (
                      <ItemDescription>{ingredient.unit}</ItemDescription>
                    ) : null}
                  </ItemContent>
                </Item>
              );
            })}
          </div>
        </ScrollArea>
      </AppSheet>

      {/* ─── 3. Single Employee Checklist Sheet ──────────────────────── */}
      <AppSheet
        open={activeEmployeeId != null}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
        title={activeEmployee?.name ?? ""}
        description={INVENTORY_VI.countAssignEditDescription(
          activeEmployee?.name ?? "",
        )}
        side="bottom"
        showCloseButton={false}
        contentClassName="max-h-dvh-95 overflow-hidden bg-background"
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={isPending}
              onClick={() => setDraftIds([])}
            >
              {INVENTORY_VI.countAssignRemoveAction}
            </Button>
            <Button
              type="button"
              size="touch-lg"
              disabled={isPending || data.ingredients.length === 0}
              onClick={saveAssignment}
            >
              {isPending ? <Spinner className="size-5" /> : null}
              {ACTIONS_VI.save}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2 px-3 pb-3 sm:px-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {INVENTORY_VI.selectedRatio(
                draftIds.length,
                data.ingredients.length,
              )}
            </span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="h-8 text-xs"
                onClick={() =>
                  setDraftIds(data.ingredients.map((i) => i.id))
                }
              >
                {INVENTORY_VI.countTemplateSelectAll}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="h-8 text-xs"
                onClick={() => setDraftIds([])}
              >
                {INVENTORY_VI.countTemplateDeselectAll}
              </Button>
            </div>
          </div>

          <InputGroup className="min-h-12">
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput
              aria-label={INVENTORY_VI.countAssignSearchPlaceholder}
              name="branchCountAssignmentSearch"
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={INVENTORY_VI.countAssignSearchPlaceholder}
              inputMode="search"
            />
          </InputGroup>
        </div>

        <ScrollArea className="min-h-0 flex-1 px-3 sm:px-4">
          <div className="flex flex-col gap-2 pb-4 pr-2">
            {visibleIngredients.length === 0 ? (
              <AppEmptyState
                compact
                mode="no-results"
                title={INVENTORY_VI.countAssignNoIngredientMatches}
              />
            ) : (
              visibleIngredients.map((ingredient) => {
                const checked = draftIds.includes(ingredient.id);
                return (
                  <Item
                    key={ingredient.id}
                    variant={checked ? "muted" : "outline"}
                    className="min-h-14 cursor-pointer"
                    onClick={() => toggleIngredient(ingredient.id)}
                  >
                    <Checkbox
                      size="touch"
                      checked={checked}
                      disabled={isPending}
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                    <ItemContent className="min-w-0">
                      <span className="break-words font-medium">
                        {ingredient.name}
                      </span>
                      {ingredient.unit ? (
                        <ItemDescription>{ingredient.unit}</ItemDescription>
                      ) : null}
                    </ItemContent>
                  </Item>
                );
              })
            )}
          </div>
        </ScrollArea>
      </AppSheet>
    </>
  );
}
