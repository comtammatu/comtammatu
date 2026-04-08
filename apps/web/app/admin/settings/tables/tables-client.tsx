"use client";

import { useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Button } from "@comtammatu/ui/components/button";
import { Plus } from "lucide-react";
import { ZoneTable } from "./zone-table";
import { ZoneFormDialog } from "./zone-form-dialog";
import { TableTable } from "./table-table";
import { TableFormDialog } from "./table-form-dialog";
import type { ZoneRow } from "./zone-table";
import type { TableRow } from "./table-table";
import { EmptyStatePanel } from "../../components/empty-state-panel";

export interface BranchOption {
  id: number;
  name: string;
  is_active: boolean | null;
}

interface TablesClientProps {
  branches: BranchOption[];
  zones: ZoneRow[];
  tables: TableRow[];
}

export function TablesClient({ branches, zones, tables }: TablesClientProps) {
  const firstBranch = branches[0];
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    firstBranch?.id ?? null,
  );
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);

  const filteredZones = zones.filter((z) => z.branch_id === selectedBranchId);
  const filteredTables = tables.filter((t) => t.branch_id === selectedBranchId);

  if (branches.length === 0) {
    return (
      <EmptyStatePanel
        title="Chưa có chi nhánh nào"
        description="Vui lòng tạo chi nhánh trước."
      />
    );
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium">Chi nhánh:</label>
        <Select
          value={selectedBranchId?.toString() ?? ""}
          onValueChange={(v) => setSelectedBranchId(Number(v))}
        >
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Chọn chi nhánh" />
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

      <Tabs defaultValue="zones">
        <TabsList>
          <TabsTrigger value="zones">
            Khu vực ({filteredZones.length})
          </TabsTrigger>
          <TabsTrigger value="tables">
            Bàn ({filteredTables.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="zones" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setZoneDialogOpen(true)}>
              <Plus className="mr-2 size-4" />
              Thêm khu vực
            </Button>
          </div>
          <ZoneTable zones={filteredZones} />
        </TabsContent>

        <TabsContent value="tables" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setTableDialogOpen(true)}>
              <Plus className="mr-2 size-4" />
              Thêm bàn
            </Button>
          </div>
          <TableTable tables={filteredTables} zones={filteredZones} />
        </TabsContent>
      </Tabs>

      {selectedBranchId !== null && (
        <>
          <ZoneFormDialog
            open={zoneDialogOpen}
            onOpenChange={setZoneDialogOpen}
            branchId={selectedBranchId}
          />
          <TableFormDialog
            open={tableDialogOpen}
            onOpenChange={setTableDialogOpen}
            branchId={selectedBranchId}
            zones={filteredZones}
          />
        </>
      )}
    </>
  );
}
