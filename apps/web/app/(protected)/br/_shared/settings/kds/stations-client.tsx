"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppEmptyState, AppToolbar } from "@/components/surface";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Label } from "@comtammatu/ui/components/label";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  ExternalLink as IconExternalLink,
  Pencil as IconPencil,
  Plus as IconPlus,
  TriangleAlert as IconAlertTriangle,
} from "lucide-react";
import { StationFormDialog } from "./station-form-dialog";
import { messages } from "@lib/messages";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { getKdsSetupWarnings } from "./setup-utils";

/* ─── Types ─── */

import { BRANCH_VI, FORM_VI } from "@comtammatu/shared/messages";
export interface StationRow {
  id: number;
  name: string;
  branch_id: number;
  position: number;
  is_active: boolean;
  category_ids: number[];
}

interface BranchOption {
  id: number;
  name: string;
  is_active: boolean | null;
}

export interface CategoryOption {
  id: number;
  name: string;
  type: string;
  sort_order: number;
}

interface StationsClientProps {
  branches: BranchOption[];
  stations: StationRow[];
  categories: CategoryOption[];
  embedded?: boolean;
}

/* ─── Component ─── */

export function StationsClient({
  branches,
  stations,
  categories,
  embedded = false,
}: StationsClientProps) {
  const copy = messages.settings.kds;
  const firstBranch = branches[0];
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    firstBranch?.id ?? null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  /** Remount dialog to reset useActionState — stale success + create flow wiped category rows */
  const [dialogSession, setDialogSession] = useState(0);
  const [editStation, setEditStation] = useState<StationRow | null>(null);
  const canSwitchBranch = branches.length > 1;

  const filteredStations = stations.filter(
    (s) => s.branch_id === selectedBranchId,
  );

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const { unmappedCategoryNames, showCatchAllWarning } = useMemo(
    () => getKdsSetupWarnings(filteredStations, categories),
    [filteredStations, categories],
  );

  const unmappedLabel = useMemo(() => {
    if (unmappedCategoryNames.length === 0) return null;
    const preview = unmappedCategoryNames.slice(0, 4).join(", ");
    const suffix =
      unmappedCategoryNames.length > 4
        ? ` (+${String(unmappedCategoryNames.length - 4)})`
        : "";
    return copy.unmappedCategoriesWarning(`${preview}${suffix}`);
  }, [copy, unmappedCategoryNames]);

  function openCreateDialog() {
    setEditStation(null);
    setDialogOpen(true);
  }

  function StationActions({
    station,
    branchId,
  }: {
    station: StationRow;
    branchId: number;
  }) {
    return (
      <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:items-center">
        <Button
          variant="outline"
          size="touch"
          className="whitespace-nowrap"
          render={
            <Link href={`/br/${branchId}/kds?station=${String(station.id)}`} />
          }
        >
          {copy.openStationKds}
        </Button>
        <Button
          variant="ghost"
          size="icon-touch"
          onClick={() => {
            setEditStation(station);
            setDialogOpen(true);
          }}
        >
          <IconPencil className="size-4" />
          <span className="sr-only">{messages.settings.common.edit}</span>
        </Button>
      </div>
    );
  }

  function CategoryBadges({ station }: { station: StationRow }) {
    if (station.category_ids.length === 0) {
      return <Badge variant="secondary">{copy.fallbackBadge}</Badge>;
    }

    return (
      <div className="flex flex-wrap gap-1.5">
        {station.category_ids.map((catId) => (
          <Badge key={catId} variant="secondary">
            {categoryMap.get(catId) ?? `#${String(catId)}`}
          </Badge>
        ))}
      </div>
    );
  }

  const columns: DataTableColumn<StationRow>[] = [
    {
      key: "name",
      header: copy.stationName,
      className: "font-medium",
      render: (station) => station.name,
    },
    {
      key: "position",
      header: copy.position,
      className: "text-center",
      render: (station) => station.position,
    },
    {
      key: "categories",
      header: copy.categories,
      render: (station) => <CategoryBadges station={station} />,
    },
    {
      key: "status",
      header: FORM_VI.status,
      className: "text-center",
      render: (station) => (
        <Badge variant={station.is_active ? "success" : "secondary"}>
          {station.is_active
            ? messages.settings.common.active
            : messages.settings.common.inactive}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "min-w-48",
      render: (station) =>
        selectedBranchId !== null ? (
          <StationActions station={station} branchId={selectedBranchId} />
        ) : null,
    },
  ];

  if (branches.length === 0) {
    return (
      <AppEmptyState
        title={messages.settings.common.noBranches}
        description={messages.settings.common.createBranchFirst}
      />
    );
  }

  return (
    <>
      <AppToolbar
        variant={embedded ? "inline" : "card"}
        filters={
          canSwitchBranch ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Label htmlFor="branch-select" className="text-sm font-medium">
                {messages.settings.common.branchLabel}
              </Label>
              <Select
                value={selectedBranchId?.toString() ?? ""}
                onValueChange={(v) => setSelectedBranchId(Number(v))}
              >
                <SelectTrigger id="branch-select" className="w-full sm:w-60">
                  <SelectValue placeholder={BRANCH_VI.select} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : undefined
        }
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {selectedBranchId !== null && filteredStations.length > 0 ? (
              <Button
                variant="outline"
                size="touch"
                className="w-full sm:w-auto"
                render={<Link href={`/br/${selectedBranchId}/kds`} />}
              >
                <IconExternalLink data-icon="inline-start" />
                {copy.openKdsUi}
              </Button>
            ) : null}
            <Button
              size="touch"
              className="w-full sm:w-auto"
              onClick={openCreateDialog}
            >
              <IconPlus data-icon="inline-start" />
              {copy.addStation}
            </Button>
          </div>
        }
      />

      {unmappedLabel ? (
        <NoteCallout tone="warning" icon={<IconAlertTriangle className="size-4" />}>
          {unmappedLabel}
        </NoteCallout>
      ) : null}
      {showCatchAllWarning ? (
        <NoteCallout tone="warning" icon={<IconAlertTriangle className="size-4" />}>
          {copy.catchAllWarning}
        </NoteCallout>
      ) : null}

      {filteredStations.length === 0 ? (
        <AppEmptyState
          title={copy.emptyForBranch}
          description={copy.emptyForBranchDescription}
        >
          <Button size="touch" onClick={openCreateDialog}>
            <IconPlus data-icon="inline-start" />
            {copy.addStation}
          </Button>
        </AppEmptyState>
      ) : (
        <DataTable
          columns={columns}
          data={filteredStations}
          getRowKey={(station) => station.id}
          mobileBreakpoint={1024}
          mobileCardRender={(station) => (
            <Item variant="outline">
              <ItemContent className="min-w-0">
                <ItemTitle size="heading" className="line-clamp-none w-full">
                  {station.name}
                </ItemTitle>
                <ItemDescription className="line-clamp-none text-sm leading-6">
                  {copy.position}: {station.position}
                </ItemDescription>
                <CategoryBadges station={station} />
                <div>
                  <Badge variant={station.is_active ? "success" : "secondary"}>
                    {station.is_active
                      ? messages.settings.common.active
                      : messages.settings.common.inactive}
                  </Badge>
                </div>
              </ItemContent>
              <ItemActions className="self-center">
                {selectedBranchId !== null ? (
                  <StationActions
                    station={station}
                    branchId={selectedBranchId}
                  />
                ) : null}
              </ItemActions>
            </Item>
          )}
        />
      )}

      {selectedBranchId !== null && (
        <StationFormDialog
          key={dialogSession}
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setDialogSession((s) => s + 1);
            }
          }}
          branchId={selectedBranchId}
          station={editStation}
          categories={categories}
        />
      )}
    </>
  );
}
