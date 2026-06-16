"use client";

import { useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Plus as IconPlus, Pencil as IconPencil } from "lucide-react";
import { StationFormDialog } from "./station-form-dialog";
import { messages } from "@lib/messages";

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
}

/* ─── Component ─── */

export function StationsClient({
  branches,
  stations,
  categories,
}: StationsClientProps) {
  const firstBranch = branches[0];
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    firstBranch?.id ?? null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  /** Remount dialog to reset useActionState — stale success + create flow wiped category rows */
  const [dialogSession, setDialogSession] = useState(0);
  const [editStation, setEditStation] = useState<StationRow | null>(null);

  const filteredStations = stations.filter(
    (s) => s.branch_id === selectedBranchId,
  );

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

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
      <AppToolbar>
        <label className="text-sm font-medium">
          {messages.settings.common.branchLabel}
        </label>
        <Select
          value={selectedBranchId?.toString() ?? ""}
          onValueChange={(v) => setSelectedBranchId(Number(v))}
        >
          <SelectTrigger className="w-60">
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
        <Button
          className="ml-auto"
          onClick={() => {
            setEditStation(null);
            setDialogOpen(true);
          }}
        >
          <IconPlus className="mr-2 size-4" />
          {messages.settings.kds.addStation}
        </Button>
      </AppToolbar>

      <div>
        {filteredStations.length === 0 ? (
          <AppEmptyState
            className="py-8"
            title={messages.settings.kds.emptyForBranch}
            compact
          />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-50">
                    {messages.settings.kds.stationName}
                  </TableHead>
                  <TableHead className="w-25 text-center">
                    {messages.settings.kds.position}
                  </TableHead>
                  <TableHead>{messages.settings.kds.categories}</TableHead>
                  <TableHead className="w-25 text-center">
                    {FORM_VI.status}
                  </TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStations.map((station) => (
                  <TableRow key={station.id}>
                    <TableCell className="font-medium">
                      {station.name}
                    </TableCell>
                    <TableCell className="text-center">
                      {station.position}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {station.category_ids.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {messages.settings.kds.allFallback}
                          </span>
                        ) : (
                          station.category_ids.map((catId) => (
                            <Badge
                              key={catId}
                              variant="secondary"
                              className="text-xs"
                            >
                              {categoryMap.get(catId) ?? `#${String(catId)}`}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={station.is_active ? "success" : "secondary"}
                        className="text-xs"
                      >
                        {station.is_active
                          ? messages.settings.common.active
                          : messages.settings.common.inactive}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditStation(station);
                          setDialogOpen(true);
                        }}
                      >
                        <IconPencil className="size-4" />
                        <span className="sr-only">
                          {messages.settings.common.edit}
                        </span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

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
