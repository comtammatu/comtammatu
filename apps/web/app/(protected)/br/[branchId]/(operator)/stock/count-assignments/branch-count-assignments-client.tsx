"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check as IconCheck,
  ChevronRight as IconChevronRight,
  ClipboardCheck as IconClipboardCheck,
  FileText as IconFileText,
  Layers as IconLayers,
  Pencil as IconPencil,
  Plus as IconPlus,
  Search as IconSearch,
  Sparkles as IconSparkles,
  Trash2 as IconTrash,
  Users as IconUsers,
  X as IconX,
  Zap as IconZap,
} from "lucide-react";
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { formatPercent } from "@comtammatu/shared/format";
import { formatVNClockTime } from "@comtammatu/shared/time";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Frame } from "@comtammatu/ui/components/frame";
import { Progress } from "@comtammatu/ui/components/progress";
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
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
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
import {
  isPositionMatchingStationRole,
  type BranchCountAssignmentData,
  type CountAssignmentEmployee,
  type CountTemplate,
} from "@lib/inventory/count-assignment-model";
import { matchesSearch } from "@lib/search";

const ALL_ROLES_VALUE = "all";

type ViewMode = "stations" | "staff";

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
  const [viewMode, setViewMode] = useState<ViewMode>("stations");
  const [selectionByEmployee, setSelectionByEmployee] = useState<
    Record<string, number[]>
  >(() => seedSelections(data));

  // Single employee sheet state
  const [activeEmployeeId, setActiveEmployeeId] = useState<number | null>(null);
  const [draftIds, setDraftIds] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [employeeSelectionFilter, setEmployeeSelectionFilter] = useState<
    "all" | "selected" | "unselected"
  >("all");

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
  const [templateSelectionFilter, setTemplateSelectionFilter] = useState<
    "all" | "selected" | "unselected"
  >("all");

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
    return data.ingredients.filter((ingredient) => {
      const matchSearch =
        !normalized ||
        matchesSearch([ingredient.name, ingredient.unit], normalized);
      const isSelected = draftIds.includes(ingredient.id);
      const matchFilter =
        employeeSelectionFilter === "all" ||
        (employeeSelectionFilter === "selected" && isSelected) ||
        (employeeSelectionFilter === "unselected" && !isSelected);
      return matchSearch && matchFilter;
    });
  }, [data.ingredients, draftIds, employeeSelectionFilter, query]);

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

  const totalAssignedUniqueItems = useMemo(() => {
    const set = new Set<number>();
    for (const ids of Object.values(selectionByEmployee)) {
      for (const id of ids) set.add(id);
    }
    return set.size;
  }, [selectionByEmployee]);

  const orderedEmployees = useMemo(() => {
    return [...filteredEmployees].sort((left, right) => {
      const leftAssigned =
        (selectionByEmployee[String(left.id)]?.length ?? 0) > 0;
      const rightAssigned =
        (selectionByEmployee[String(right.id)]?.length ?? 0) > 0;
      const leftOnShift =
        data.selectedShiftId != null &&
        Boolean(left.scheduledShiftIds?.includes(data.selectedShiftId));
      const rightOnShift =
        data.selectedShiftId != null &&
        Boolean(right.scheduledShiftIds?.includes(data.selectedShiftId));

      return (
        Number(rightAssigned) - Number(leftAssigned) ||
        Number(rightOnShift) - Number(leftOnShift) ||
        left.name.localeCompare(right.name, "vi")
      );
    });
  }, [data.selectedShiftId, filteredEmployees, selectionByEmployee]);

  const unassignedIngredients = useMemo(() => {
    const assignedSet = new Set<number>();
    for (const ids of Object.values(selectionByEmployee)) {
      for (const id of ids) assignedSet.add(id);
    }
    return data.ingredients.filter((ing) => !assignedSet.has(ing.id));
  }, [data.ingredients, selectionByEmployee]);

  const [unassignedSheetOpen, setUnassignedSheetOpen] = useState(false);
  const [unassignedTargetEmpId, setUnassignedTargetEmpId] = useState<string>("");

  function applyDutyRosterAssignments() {
    if (data.selectedLocationId == null) {
      toast.error("Vui lòng chọn kho kiểm kê.");
      return;
    }

    const onDutyEmployees = data.employees.filter((emp) => {
      if (data.selectedShiftId == null) return true;
      return Boolean(emp.scheduledShiftIds?.includes(data.selectedShiftId));
    });

    if (onDutyEmployees.length === 0) {
      toast.error(INVENTORY_VI.countAssignQuickRosterNoStaff);
      return;
    }

    const nextSelections: Record<string, number[]> = {};
    for (const emp of data.employees) {
      nextSelections[String(emp.id)] = [];
    }

    const coveredIngredientIds = new Set<number>();
    const participatingStaffIds = new Set<number>();

    for (const template of data.templates) {
      const matchingStaff = onDutyEmployees.filter((emp) =>
        isPositionMatchingStationRole(emp.positionCode, template.stationRole),
      );
      const targetStaff = matchingStaff[0] ?? onDutyEmployees[0];
      if (targetStaff) {
        const empKey = String(targetStaff.id);
        const existing = nextSelections[empKey] ?? [];
        const newIds = template.ingredientIds.filter(
          (id) => !existing.includes(id),
        );
        nextSelections[empKey] = [...existing, ...newIds];
        template.ingredientIds.forEach((id) => coveredIngredientIds.add(id));
        participatingStaffIds.add(targetStaff.id);
      }
    }

    const remaining = data.ingredients.filter(
      (ing) => !coveredIngredientIds.has(ing.id),
    );
    if (remaining.length > 0 && onDutyEmployees[0]) {
      const primaryKey = String(onDutyEmployees[0].id);
      const existing = nextSelections[primaryKey] ?? [];
      const newIds = remaining
        .map((ing) => ing.id)
        .filter((id) => !existing.includes(id));
      nextSelections[primaryKey] = [...existing, ...newIds];
      remaining.forEach((ing) => coveredIngredientIds.add(ing.id));
      participatingStaffIds.add(onDutyEmployees[0].id);
    }

    setSelectionByEmployee(nextSelections);

    startTransition(async () => {
      const updatePromises = data.employees.map(async (emp) => {
        const nextIds = nextSelections[String(emp.id)] ?? [];
        const prevIds = data.assignmentsByEmployee[String(emp.id)] ?? [];
        if (
          nextIds.length === prevIds.length &&
          nextIds.every((id) => prevIds.includes(id))
        ) {
          return { success: true };
        }
        return setCountAssignments({
          branchId: data.branchId,
          locationId: data.selectedLocationId as number,
          shiftId: data.selectedShiftId,
          employeeId: emp.id,
          ingredientIds: nextIds,
        });
      });

      const results = await Promise.all(updatePromises);
      const failed = results.find((r) => !r.success);
      if (failed) {
        toast.error(failed.error ?? INVENTORY_VI.countAssignSaveFailed);
        setSelectionByEmployee(seedSelections(data));
        return;
      }

      toast.success(
        INVENTORY_VI.countAssignQuickRosterSuccess(
          coveredIngredientIds.size,
          participatingStaffIds.size,
        ),
      );
      router.refresh();
    });
  }

  function assignAllUnassignedToStaff(targetEmpId: number) {
    if (data.selectedLocationId == null || unassignedIngredients.length === 0)
      return;
    const targetEmployee = employeeById.get(targetEmpId);
    if (!targetEmployee) return;

    const unassignedIds = unassignedIngredients.map((i) => i.id);
    const empKey = String(targetEmpId);
    const existing = selectionByEmployee[empKey] ?? [];
    const nextIds = Array.from(new Set([...existing, ...unassignedIds]));

    setSelectionByEmployee((prev) => ({
      ...prev,
      [empKey]: nextIds,
    }));

    startTransition(async () => {
      const result = await setCountAssignments({
        branchId: data.branchId,
        locationId: data.selectedLocationId as number,
        shiftId: data.selectedShiftId,
        employeeId: targetEmpId,
        ingredientIds: nextIds,
      });

      if (!result.success) {
        toast.error(result.error ?? INVENTORY_VI.countAssignSaveFailed);
        setSelectionByEmployee(seedSelections(data));
        return;
      }

      toast.success(
        `Đã giao thêm ${unassignedIds.length} món cho ${targetEmployee.name}.`,
      );
      setUnassignedSheetOpen(false);
      setUnassignedTargetEmpId("");
      router.refresh();
    });
  }

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
      const onDutyMatchingStaff = data.employees.filter((emp) => {
        const isRoleMatch = isPositionMatchingStationRole(
          emp.positionCode,
          template.stationRole,
        );
        const isOnShift =
          data.selectedShiftId != null &&
          Boolean(emp.scheduledShiftIds?.includes(data.selectedShiftId));
        return isRoleMatch && (data.selectedShiftId == null || isOnShift);
      });

      if (onDutyMatchingStaff.length === 1) {
        const singleEmp = onDutyMatchingStaff[0]!;
        existingStaff.add(singleEmp.id);
        for (const ingId of template.ingredientIds) {
          currentDraft[ingId] = singleEmp.id;
        }
      } else if (onDutyMatchingStaff.length > 1) {
        for (const emp of onDutyMatchingStaff) {
          existingStaff.add(emp.id);
        }
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
      const nextStaffIds = [...stationStaffIds, empId];
      setStationStaffIds(nextStaffIds);
      if (nextStaffIds.length === 1 && activeStation) {
        const nextDraft: Record<number, number | null> = {};
        for (const ingId of activeStation.ingredientIds) {
          nextDraft[ingId] = empId;
        }
        setStationAssignmentsDraft(nextDraft);
      }
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

    // Optimistically update local selections immediately
    setSelectionByEmployee((current) => {
      const next = { ...current };
      for (const empIdStr of Object.keys(next)) {
        next[empIdStr] = (next[empIdStr] ?? []).filter(
          (id) => !activeStation.ingredientIds.includes(id),
        );
      }
      for (const assignment of payloadAssignments) {
        const key = String(assignment.employeeId);
        const existing = next[key] ?? [];
        next[key] = Array.from(
          new Set([...existing, ...assignment.ingredientIds]),
        );
      }
      return next;
    });

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
        setSelectionByEmployee(seedSelections(data));
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
    setTemplateSelectionFilter("all");
  }

  function closeTemplateEditor() {
    setEditingTemplate(null);
    setTemplateDraftName("");
    setTemplateDraftRole("custom");
    setTemplateDraftIngredientIds([]);
    setTemplateIngredientQuery("");
    setTemplateSelectionFilter("all");
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
    setEmployeeSelectionFilter("all");
  }

  function closeEditor() {
    setActiveEmployeeId(null);
    setDraftIds([]);
    setQuery("");
    setEmployeeSelectionFilter("all");
  }

  function toggleIngredient(ingredientId: number) {
    setDraftIds((current) =>
      current.includes(ingredientId)
        ? current.filter((id) => id !== ingredientId)
        : [...current, ingredientId],
    );
  }

  function toggleStationShortcut(template: CountTemplate) {
    const templateIds = template.ingredientIds;
    const allIncluded = templateIds.length > 0 && templateIds.every((id) => draftIds.includes(id));
    if (allIncluded) {
      setDraftIds((current) =>
        current.filter((id) => !templateIds.includes(id)),
      );
    } else {
      setDraftIds((current) => Array.from(new Set([...current, ...templateIds])));
    }
  }

  function saveAssignment() {
    if (!activeEmployee || data.selectedLocationId == null) {
      return;
    }
    const nextIds = [...draftIds];
    const targetEmpId = activeEmployee.id;

    // Optimistically update local selections
    setSelectionByEmployee((current) => ({
      ...current,
      [String(targetEmpId)]: nextIds,
    }));

    startTransition(async () => {
      const result = await setCountAssignments({
        branchId: data.branchId,
        locationId: data.selectedLocationId as number,
        employeeId: targetEmpId,
        shiftId: data.selectedShiftId,
        ingredientIds: nextIds,
      });
      if (!result.success) {
        toast.error(result.error ?? INVENTORY_VI.countAssignSaveFailed);
        setSelectionByEmployee(seedSelections(data));
        return;
      }
      toast.success(
        nextIds.length === 0
          ? INVENTORY_VI.countAssignRemoved(activeEmployee.name)
          : INVENTORY_VI.countAssignSaved(activeEmployee.name, nextIds.length),
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
      {/* Scope selector: Location & Shift */}
      <div className="flex flex-col gap-3">
        {data.locationOptions.length > 1 ? (
          <div className="flex min-w-0 flex-col gap-1.5">
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
        ) : null}

        {data.shiftOptions.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-muted-foreground">
                {INVENTORY_VI.countAssignShiftLabel}
              </Label>
              <span className="text-xs text-muted-foreground">
                {INVENTORY_VI.countAssignProgressSummary(
                  assignedEmployeeCount,
                  data.employees.length,
                  totalAssignedUniqueItems,
                  data.ingredients.length,
                )}
              </span>
            </div>
            <div
              className="no-scrollbar flex touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain pb-1"
              role="group"
              aria-label={INVENTORY_VI.countAssignShiftLabel}
            >
              <Button
                type="button"
                variant={data.selectedShiftId == null ? "secondary" : "outline"}
                size="touch"
                aria-pressed={data.selectedShiftId == null}
                className="shrink-0 gap-2 px-3"
                onClick={() => replaceScope(data.selectedLocationId, null)}
              >
                <span className="whitespace-nowrap">
                  {INVENTORY_VI.countAssignAllShifts}
                </span>
              </Button>
              {data.shiftOptions.map((shift) => {
                const active = data.selectedShiftId === shift.id;
                return (
                  <Button
                    key={shift.id}
                    type="button"
                    variant={active ? "secondary" : "outline"}
                    size="touch"
                    aria-pressed={active}
                    className="shrink-0 gap-2 px-3"
                    onClick={() =>
                      replaceScope(data.selectedLocationId, shift.id)
                    }
                  >
                    <span className="whitespace-nowrap">{shift.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({formatVNClockTime(shift.startTime)}-
                      {formatVNClockTime(shift.endTime)})
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* Coverage Tracker Banner */}
      <Frame className="flex flex-col gap-2 p-3 bg-card">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                {INVENTORY_VI.countAssignCoverageBadge(
                  totalAssignedUniqueItems,
                  data.ingredients.length,
                )}
              </span>
              <Badge
                variant={
                  totalAssignedUniqueItems === data.ingredients.length
                    ? "default"
                    : "outline"
                }
              >
                {formatPercent(
                  data.ingredients.length > 0
                    ? Math.round(
                        (totalAssignedUniqueItems / data.ingredients.length) *
                          100,
                      )
                    : 0,
                  0,
                )}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              {unassignedIngredients.length === 0
                ? "Tất cả nguyên liệu trong kho đã được phân công đếm."
                : `Còn ${unassignedIngredients.length} món chưa có người đếm tồn.`}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {unassignedIngredients.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="text-xs"
                onClick={() => setUnassignedSheetOpen(true)}
              >
                <IconClipboardCheck className="size-4" />
                {INVENTORY_VI.countAssignUnassignedFilter(
                  unassignedIngredients.length,
                )}
              </Button>
            ) : null}

            <Button
              type="button"
              variant="default"
              size="touch"
              disabled={isPending || data.templates.length === 0}
              className="gap-1.5 text-xs"
              onClick={applyDutyRosterAssignments}
            >
              <IconZap className="size-4" />
              {INVENTORY_VI.countAssignQuickRosterAction}
            </Button>
          </div>
        </div>

        {/* Progress Bar */}
        <Progress
          value={
            data.ingredients.length > 0
              ? Math.round(
                  (totalAssignedUniqueItems / data.ingredients.length) * 100,
                )
              : 0
          }
          className="h-1.5"
        />
      </Frame>

      {/* View Switcher: Stations vs Staff */}
      <div className="flex items-center gap-1 rounded-md bg-muted p-1">
        <Button
          type="button"
          variant={viewMode === "stations" ? "default" : "ghost"}
          size="touch"
          className="flex-1 gap-2 text-xs font-medium"
          onClick={() => setViewMode("stations")}
        >
          <IconLayers className="size-4" />
          <span>{INVENTORY_VI.countViewByStation(data.templates.length)}</span>
        </Button>
        <Button
          type="button"
          variant={viewMode === "staff" ? "default" : "ghost"}
          size="touch"
          className="flex-1 gap-2 text-xs font-medium"
          onClick={() => setViewMode("staff")}
        >
          <IconUsers className="size-4" />
          <span>{INVENTORY_VI.countViewByStaff(data.employees.length)}</span>
        </Button>
      </div>

      {/* VIEW 1: Station Role Templates */}
      {viewMode === "stations" ? (
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
                      size="touch"
                      className="flex-1"
                      onClick={() => openStationAssignment(template)}
                    >
                      <IconUsers className="size-3.5" />
                      {INVENTORY_VI.countStationAssignAction}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="touch"
                      aria-label={INVENTORY_VI.countStationEditAction}
                      onClick={() => openTemplateEditor(template)}
                    >
                      <IconPencil className="size-3.5" />
                    </Button>
                  </div>
                </Item>
              );
            })}
          </ItemGroup>
        </div>
      ) : null}

      {/* VIEW 2: Staff Roster Overview */}
      {viewMode === "staff" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {INVENTORY_VI.staffRosterTitle}
            </span>
            <span className="text-xs text-muted-foreground">
              {INVENTORY_VI.staffRosterDescription}
            </span>
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
              <div className="w-full sm:w-64">
                <Select
                  value={selectedRoleFilter}
                  onValueChange={setSelectedRoleFilter}
                >
                  <SelectTrigger size="touch" className="w-full">
                    <SelectValue placeholder={INVENTORY_VI.roleFilterAll} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_ROLES_VALUE} size="touch">
                      {INVENTORY_VI.roleFilterAll} ({data.employees.length})
                    </SelectItem>
                    {availableRoles.map((role) => {
                      const roleCount = data.employees.filter(
                        (e) => e.positionName === role,
                      ).length;
                      return (
                        <SelectItem key={role} value={role} size="touch">
                          {role} ({roleCount})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          {orderedEmployees.length === 0 ? (
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
                      <div className="flex flex-wrap items-center gap-2">
                        <ItemTitle size="heading">{employee.name}</ItemTitle>
                        {employee.positionName ? (
                          <Badge variant="outline" className="text-xs">
                            {employee.positionName}
                          </Badge>
                        ) : null}
                        {data.selectedShiftId != null &&
                        employee.scheduledShiftIds?.includes(
                          data.selectedShiftId,
                        ) ? (
                          <Badge
                            variant="outline"
                            className="px-1.5 py-0 text-xs text-primary"
                          >
                            {INVENTORY_VI.countStationOnDutyBadge}
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
      ) : null}
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
    return data.ingredients.filter((ingredient) => {
      const matchSearch =
        !normalized ||
        matchesSearch([ingredient.name, ingredient.unit], normalized);
      const isSelected = templateDraftIngredientIds.includes(ingredient.id);
      const matchFilter =
        templateSelectionFilter === "all" ||
        (templateSelectionFilter === "selected" && isSelected) ||
        (templateSelectionFilter === "unselected" && !isSelected);
      return matchSearch && matchFilter;
    });
  }, [
    data.ingredients,
    templateDraftIngredientIds,
    templateIngredientQuery,
    templateSelectionFilter,
  ]);

  const availableStationEmployees = useMemo(() => {
    if (!activeStation) return [];
    const currentStaffSet = new Set(stationStaffIds);
    const available = data.employees.filter(
      (emp) => !currentStaffSet.has(emp.id),
    );
    const selectedShift = data.selectedShiftId;

    return [...available].sort((left, right) => {
      const leftShift =
        selectedShift != null &&
        Boolean(left.scheduledShiftIds?.includes(selectedShift));
      const rightShift =
        selectedShift != null &&
        Boolean(right.scheduledShiftIds?.includes(selectedShift));

      const leftRole = isPositionMatchingStationRole(
        left.positionCode,
        activeStation.stationRole,
      );
      const rightRole = isPositionMatchingStationRole(
        right.positionCode,
        activeStation.stationRole,
      );

      return (
        Number(rightRole && rightShift) - Number(leftRole && leftShift) ||
        Number(rightShift) - Number(leftShift) ||
        Number(rightRole) - Number(leftRole) ||
        left.name.localeCompare(right.name, "vi")
      );
    });
  }, [activeStation, data.employees, data.selectedShiftId, stationStaffIds]);

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
        description={
          activeStation
            ? INVENTORY_VI.countStationItemsCount(
                activeStation.ingredientIds.length,
              )
            : ""
        }
        side="bottom"
        showCloseButton={false}
        contentClassName="max-h-dvh-95 flex flex-col overflow-hidden sm:mx-auto sm:max-w-3xl"
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="flex-1 sm:flex-initial"
              disabled={isPending}
              onClick={closeStationAssignment}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="button"
              size="touch"
              className="flex-1 sm:flex-initial"
              disabled={isPending || !activeStation || stationStaffIds.length === 0}
              onClick={saveStationAssignment}
            >
              {isPending ? <Spinner className="size-5" /> : null}
              {ACTIONS_VI.save}
            </Button>
          </div>
        }
      >
        <div className="flex shrink-0 flex-col gap-3 px-3 pb-3 pt-2 sm:px-4">
          {/* Step 1: Staff Selection */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {INVENTORY_VI.countStationStaffTitle} ({stationStaffIds.length})
              </span>
              {stationStaffIds.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs text-destructive hover:text-destructive"
                  onClick={() => {
                    setStationStaffIds([]);
                    setStationAssignmentsDraft({});
                  }}
                >
                  {INVENTORY_VI.countTemplateDeselectAll}
                </Button>
              ) : null}
            </div>

            {/* Currently selected staff chips */}
            {stationStaffIds.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {stationStaffIds.map((empId) => {
                  const emp = employeeById.get(empId);
                  const isOnShift =
                    data.selectedShiftId != null &&
                    Boolean(
                      emp?.scheduledShiftIds?.includes(data.selectedShiftId),
                    );
                  return (
                    <Badge
                      key={empId}
                      variant="secondary"
                      className="flex items-center gap-1.5 py-1 pl-2.5 pr-1 text-sm font-medium"
                    >
                      <span>{emp?.name ?? `#${empId}`}</span>
                      {emp?.positionName ? (
                        <span className="text-xs text-muted-foreground">
                          ({emp.positionName})
                        </span>
                      ) : null}
                      {isOnShift ? (
                        <span className="text-xs font-semibold text-primary">
                          • {INVENTORY_VI.countStationOnDutyBadge}
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="touch"
                        aria-label={ACTIONS_VI.delete}
                        className="size-5 min-h-0 min-w-0 rounded-full p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => removeStaffFromStation(empId)}
                      >
                        <IconX className="size-3" />
                      </Button>
                    </Badge>
                  );
                })}
              </div>
            ) : null}

            {/* Single Unified Staff Select */}
            {availableStationEmployees.length > 0 ? (
              <Select
                value={stationCandidateEmpId}
                onValueChange={(val) => {
                  if (val) addStaffToStation(Number(val));
                }}
              >
                <SelectTrigger size="touch" className="w-full">
                  <SelectValue
                    placeholder={
                      stationStaffIds.length === 0
                        ? INVENTORY_VI.countStationSelectStaffPlaceholder
                        : "+ Thêm nhân sự vào trạm…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableStationEmployees.map((emp) => {
                    const isOnShift =
                      data.selectedShiftId != null &&
                      Boolean(
                        emp.scheduledShiftIds?.includes(data.selectedShiftId),
                      );
                    return (
                      <SelectItem
                        key={emp.id}
                        value={String(emp.id)}
                        size="touch"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{emp.name}</span>
                          {emp.positionName ? (
                            <span className="text-xs text-muted-foreground">
                              ({emp.positionName})
                            </span>
                          ) : null}
                          {isOnShift ? (
                            <Badge
                              variant="outline"
                              className="px-1 py-0 text-xs text-primary"
                            >
                              {INVENTORY_VI.countStationOnDutyBadge}
                            </Badge>
                          ) : null}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          {/* Step 2: Distribution summary / helpers */}
          {stationStaffIds.length === 0 ? (
            <NoteCallout
              tone="muted"
              label={INVENTORY_VI.countStationNoStaffSelected}
              className="mt-1"
            >
              <span className="text-xs text-muted-foreground">
                {INVENTORY_VI.countStationPickStaffHint}
              </span>
            </NoteCallout>
          ) : stationStaffIds.length === 1 ? (
            <NoteCallout
              tone="muted"
              icon={<IconCheck className="size-4 text-primary" />}
              label={INVENTORY_VI.countStationAutoAssignTitle}
              className="mt-1"
            >
              <span className="text-xs">
                {INVENTORY_VI.countStationAutoAssignBody(
                  activeStation?.ingredientIds.length ?? 0,
                  employeeById.get(stationStaffIds[0]!)?.name ?? "",
                )}
              </span>
            </NoteCallout>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
              <span className="text-xs font-semibold text-muted-foreground">
                {INVENTORY_VI.countStationDistributeHeader(
                  stationStaffIds.length,
                )}
              </span>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="h-8 text-xs font-medium"
                  onClick={splitStationItemsEvenly}
                >
                  <IconSparkles className="size-3.5 mr-1" />
                  {INVENTORY_VI.countStationSplitEvenly}
                </Button>
                {stationStaffIds.map((empId) => {
                  const emp = employeeById.get(empId);
                  return (
                    <Button
                      key={empId}
                      type="button"
                      variant="outline"
                      size="touch"
                      className="h-8 text-xs"
                      onClick={() => assignAllStationItemsTo(empId)}
                    >
                      {INVENTORY_VI.countStationAssignAllTo(emp?.name ?? "")}
                    </Button>
                  );
                })}
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  className="h-8 text-xs text-destructive hover:text-destructive"
                  onClick={clearStationAssignments}
                >
                  {INVENTORY_VI.countStationClearAssignments}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Station Ingredients List */}
        {activeStation && activeStation.ingredientIds.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 sm:px-4">
            <div className="flex flex-col gap-2">
              {activeStation.ingredientIds.map((ingId) => {
                const ing = ingredientById.get(ingId);
                const currentEmpId = stationAssignmentsDraft[ingId] ?? null;
                const assignedEmp =
                  currentEmpId != null ? employeeById.get(currentEmpId) : null;

                return (
                  <Item
                    key={ingId}
                    variant="outline"
                    className={cn(
                      "flex-col items-start gap-2 p-3 transition-colors",
                      currentEmpId != null
                        ? "border-primary bg-accent"
                        : "border-border bg-card",
                    )}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {ing?.name ?? `#${ingId}`}
                      </span>
                      <div className="flex items-center gap-2">
                        {ing?.unit ? (
                          <Badge variant="outline" className="text-xs">
                            {ing.unit}
                          </Badge>
                        ) : null}
                        {assignedEmp ? (
                          <Badge
                            variant="success"
                            className="text-xs font-medium"
                          >
                            {INVENTORY_VI.countBadgeAssignedTo(assignedEmp.name)}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-xs text-muted-foreground"
                          >
                            {INVENTORY_VI.countStationUnassigned}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Quick Assignee Pill selection for multi-staff setup */}
                    {stationStaffIds.length > 1 ? (
                      <div className="flex flex-wrap gap-1 pt-1">
                        <Button
                          type="button"
                          variant={currentEmpId === null ? "default" : "outline"}
                          size="touch"
                          className="h-8 text-xs font-medium"
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
                              className="h-8 text-xs font-medium"
                              onClick={() =>
                                setStationAssignmentsDraft((prev) => ({
                                  ...prev,
                                  [ingId]: empId,
                                }))
                              }
                            >
                              {isSelected ? (
                                <IconCheck className="size-3 mr-1" />
                              ) : null}
                              {emp?.name ?? `#${empId}`}
                            </Button>
                          );
                        })}
                      </div>
                    ) : null}
                  </Item>
                );
              })}
            </div>
          </div>
        ) : null}
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
        contentClassName="max-h-dvh-95 flex flex-col overflow-hidden sm:mx-auto sm:max-w-2xl"
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            {editingTemplate &&
            editingTemplate !== "new" &&
            !editingTemplate.isSystem ? (
              <Button
                type="button"
                variant="destructive"
                size="touch"
                className="mr-auto"
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
              className="flex-1 sm:flex-initial"
              disabled={isPending}
              onClick={closeTemplateEditor}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="button"
              size="touch"
              className="flex-1 sm:flex-initial"
              disabled={isPending || !templateDraftName.trim()}
              onClick={saveTemplate}
            >
              {isPending ? <Spinner className="size-5" /> : null}
              {ACTIONS_VI.save}
            </Button>
          </div>
        }
      >
        <div className="flex shrink-0 flex-col gap-2 px-3 pb-2 pt-1 sm:px-4">
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="templateDraftName"
              className="text-xs font-semibold"
            >
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

          {/* Quick Select & Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                variant={
                  templateSelectionFilter === "all" ? "default" : "outline"
                }
                size="touch"
                className="h-8 text-xs font-medium"
                onClick={() => setTemplateSelectionFilter("all")}
              >
                {INVENTORY_VI.countTabAllWithCount(data.ingredients.length)}
              </Button>
              <Button
                type="button"
                variant={
                  templateSelectionFilter === "selected"
                    ? "default"
                    : "outline"
                }
                size="touch"
                className="h-8 text-xs font-medium"
                onClick={() => setTemplateSelectionFilter("selected")}
              >
                {INVENTORY_VI.countTabSelectedWithCount(
                  templateDraftIngredientIds.length,
                )}
              </Button>
              <Button
                type="button"
                variant={
                  templateSelectionFilter === "unselected"
                    ? "default"
                    : "outline"
                }
                size="touch"
                className="h-8 text-xs font-medium"
                onClick={() => setTemplateSelectionFilter("unselected")}
              >
                {INVENTORY_VI.countTabUnselectedWithCount(
                  data.ingredients.length - templateDraftIngredientIds.length,
                )}
              </Button>
            </div>
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

          <InputGroup className="min-h-11">
            <InputGroupAddon>
              <IconSearch className="size-4" />
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

        {/* Native Smooth Scrollable Ingredient List */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 sm:px-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {templateVisibleIngredients.map((ingredient) => {
              const checked = templateDraftIngredientIds.includes(
                ingredient.id,
              );
              return (
                <Item
                  key={ingredient.id}
                  variant={checked ? "muted" : "outline"}
                  className={cn(
                    "min-h-14 cursor-pointer justify-between transition-colors",
                    checked
                      ? "border-primary bg-accent"
                      : "hover:bg-muted",
                  )}
                  onClick={() => toggleTemplateIngredient(ingredient.id)}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Checkbox
                      size="touch"
                      checked={checked}
                      disabled={isPending}
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                    <ItemContent className="min-w-0">
                      <span className="break-words font-medium text-foreground">
                        {ingredient.name}
                      </span>
                      {ingredient.unit ? (
                        <ItemDescription>{ingredient.unit}</ItemDescription>
                      ) : null}
                    </ItemContent>
                  </div>
                </Item>
              );
            })}
          </div>
        </div>
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
        contentClassName="max-h-dvh-95 flex flex-col overflow-hidden sm:mx-auto sm:max-w-2xl"
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="flex-1 sm:flex-initial"
              disabled={isPending}
              onClick={() => setDraftIds([])}
            >
              {INVENTORY_VI.countAssignRemoveAction}
            </Button>
            <Button
              type="button"
              size="touch"
              className="flex-1 sm:flex-initial"
              disabled={isPending || data.ingredients.length === 0}
              onClick={saveAssignment}
            >
              {isPending ? <Spinner className="size-5" /> : null}
              {ACTIONS_VI.save}
            </Button>
          </div>
        }
      >
        <div className="flex shrink-0 flex-col gap-2 px-3 pb-2 pt-1 sm:px-4">
          {/* Quick station shortcuts */}
          {data.templates.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                {INVENTORY_VI.countStationQuickShortcuts}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {data.templates.map((tpl) => {
                  const allIncluded = tpl.ingredientIds.length > 0 && tpl.ingredientIds.every((id) =>
                    draftIds.includes(id),
                  );
                  return (
                    <Button
                      key={tpl.id}
                      type="button"
                      variant={allIncluded ? "secondary" : "outline"}
                      size="touch"
                      className="h-8 text-xs gap-1.5 font-medium"
                      onClick={() => toggleStationShortcut(tpl)}
                    >
                      <IconZap
                        className={cn(
                          "size-3",
                          allIncluded
                            ? "text-primary fill-primary"
                            : "text-muted-foreground",
                        )}
                      />
                      <span>
                        {tpl.name} ({tpl.ingredientIds.length})
                      </span>
                      {allIncluded ? <IconCheck className="size-3 ml-0.5" /> : null}
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Quick Select & Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                variant={
                  employeeSelectionFilter === "all" ? "default" : "outline"
                }
                size="touch"
                className="h-8 text-xs font-medium"
                onClick={() => setEmployeeSelectionFilter("all")}
              >
                {INVENTORY_VI.countTabAllWithCount(data.ingredients.length)}
              </Button>
              <Button
                type="button"
                variant={
                  employeeSelectionFilter === "selected"
                    ? "default"
                    : "outline"
                }
                size="touch"
                className="h-8 text-xs font-medium"
                onClick={() => setEmployeeSelectionFilter("selected")}
              >
                {INVENTORY_VI.countTabSelectedWithCount(draftIds.length)}
              </Button>
              <Button
                type="button"
                variant={
                  employeeSelectionFilter === "unselected"
                    ? "default"
                    : "outline"
                }
                size="touch"
                className="h-8 text-xs font-medium"
                onClick={() => setEmployeeSelectionFilter("unselected")}
              >
                {INVENTORY_VI.countTabUnselectedWithCount(
                  data.ingredients.length - draftIds.length,
                )}
              </Button>
            </div>
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

          <InputGroup className="min-h-11">
            <InputGroupAddon>
              <IconSearch className="size-4" />
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

        {/* Native Smooth Scrollable Ingredient List */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 sm:px-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                    className={cn(
                      "min-h-14 cursor-pointer justify-between transition-colors",
                      checked
                        ? "border-primary bg-accent"
                        : "hover:bg-muted",
                    )}
                    onClick={() => toggleIngredient(ingredient.id)}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Checkbox
                        size="touch"
                        checked={checked}
                        disabled={isPending}
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                      <ItemContent className="min-w-0">
                        <span className="break-words font-medium text-foreground">
                          {ingredient.name}
                        </span>
                        {ingredient.unit ? (
                          <ItemDescription>{ingredient.unit}</ItemDescription>
                        ) : null}
                      </ItemContent>
                    </div>
                  </Item>
                );
              })
            )}
          </div>
        </div>
      </AppSheet>

      {/* Unassigned Items Sheet */}
      <AppSheet
        open={unassignedSheetOpen}
        onOpenChange={setUnassignedSheetOpen}
        title={INVENTORY_VI.countAssignUnassignedTitle}
        description={INVENTORY_VI.countAssignUnassignedDesc(
          unassignedIngredients.length,
        )}
        size="lg"
      >
        <div className="flex flex-col gap-4 p-4">
          <Frame className="flex flex-col gap-2 p-3 bg-muted">
            <Label className="text-xs font-semibold">
              {INVENTORY_VI.countAssignUnassignedPrompt(
                unassignedIngredients.length,
              )}
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex-1">
                <Select
                  value={unassignedTargetEmpId}
                  onValueChange={setUnassignedTargetEmpId}
                >
                  <SelectTrigger size="touch" className="w-full">
                    <SelectValue
                      placeholder={
                        INVENTORY_VI.countAssignSelectReceiverPlaceholder
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {data.employees.map((emp) => {
                      const isOnDuty =
                        data.selectedShiftId != null &&
                        Boolean(
                          emp.scheduledShiftIds?.includes(data.selectedShiftId),
                        );
                      return (
                        <SelectItem
                          key={emp.id}
                          value={String(emp.id)}
                          size="touch"
                        >
                          {emp.name}{" "}
                          {emp.positionName ? `(${emp.positionName})` : ""}{" "}
                          {isOnDuty
                            ? ` ${INVENTORY_VI.countAssignOnDutyDot}`
                            : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="default"
                size="touch"
                disabled={!unassignedTargetEmpId || isPending}
                onClick={() =>
                  assignAllUnassignedToStaff(Number(unassignedTargetEmpId))
                }
              >
                <IconZap className="size-4" />
                {INVENTORY_VI.countAssignUnassignedAction}
              </Button>
            </div>
          </Frame>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {INVENTORY_VI.countAssignUnassignedListLabel}
            </span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {unassignedIngredients.map((ing) => (
                <Item key={ing.id} variant="outline" className="min-h-12 p-2.5">
                  <ItemContent className="min-w-0">
                    <span className="font-medium text-foreground">
                      {ing.name}
                    </span>
                    {ing.unit ? (
                      <ItemDescription>{ing.unit}</ItemDescription>
                    ) : null}
                  </ItemContent>
                </Item>
              ))}
            </div>
          </div>
        </div>
      </AppSheet>
    </>
  );
}
