"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@comtammatu/ui/components/form";
import { Input } from "@comtammatu/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Switch } from "@comtammatu/ui/components/switch";
import type { BranchRow, ZoneRow, TableRow } from "./actions";
import {
  getZones,
  getTables,
  createZone,
  updateZone,
  deleteZone,
  createTable,
  updateTable,
  deleteTable,
} from "./actions";

// ─── Schemas ───────────────────────────────────────────────────────────────

const zoneFormSchema = z.object({
  name: z.string().min(1, { error: "Tên khu vực không được để trống" }),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

const tableFormSchema = z.object({
  name: z.string().min(1, { error: "Tên bàn không được để trống" }),
  capacity: z.number().int().min(1, { error: "Số chỗ ngồi phải ít nhất 1" }),
  zone_id: z.number().int().nullable().optional(),
  is_active: z.boolean().optional(),
});

type ZoneFormValues = z.infer<typeof zoneFormSchema>;
type TableFormValues = z.infer<typeof tableFormSchema>;

// ─── Zone Dialog ───────────────────────────────────────────────────────────

interface ZoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingZone: ZoneRow | null;
  defaultSortOrder: number;
  onSave: (values: ZoneFormValues) => void;
  isPending: boolean;
}

function ZoneDialog({
  open,
  onOpenChange,
  editingZone,
  defaultSortOrder,
  onSave,
  isPending,
}: ZoneDialogProps) {
  const form = useForm<ZoneFormValues>({
    resolver: zodResolver(zoneFormSchema),
    values:
      editingZone !== null
        ? {
            name: editingZone.name,
            sort_order: editingZone.sort_order,
            is_active: editingZone.is_active,
          }
        : { name: "", sort_order: defaultSortOrder, is_active: true },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {editingZone !== null ? "Sửa khu vực" : "Thêm khu vực"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSave)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên khu vực *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ví dụ: Khu trong, Sân thượng"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sort_order"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Thứ tự hiển thị</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      value={field.value ?? 0}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel className="text-sm font-medium">
                      Đang hoạt động
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Khu vực có thể nhận khách
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value ?? true}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? "Đang lưu..."
                  : editingZone !== null
                    ? "Lưu thay đổi"
                    : "Tạo khu vực"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Table Dialog ──────────────────────────────────────────────────────────

interface TableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTable: TableRow | null;
  defaultZoneId: number | null;
  zones: ZoneRow[];
  onSave: (values: TableFormValues) => void;
  isPending: boolean;
}

function TableDialog({
  open,
  onOpenChange,
  editingTable,
  defaultZoneId,
  zones,
  onSave,
  isPending,
}: TableDialogProps) {
  const form = useForm<TableFormValues>({
    resolver: zodResolver(tableFormSchema),
    values:
      editingTable !== null
        ? {
            name: editingTable.name,
            capacity: editingTable.capacity,
            zone_id: editingTable.zone_id,
            is_active: editingTable.is_active,
          }
        : { name: "", capacity: 4, zone_id: defaultZoneId, is_active: true },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {editingTable !== null ? "Sửa bàn" : "Thêm bàn"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên bàn *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ví dụ: Bàn 1, A01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Số chỗ ngồi *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      value={field.value}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 1)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="zone_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Khu vực</FormLabel>
                  <Select
                    value={field.value?.toString() ?? "none"}
                    onValueChange={(v) =>
                      field.onChange(v === "none" ? null : parseInt(v, 10))
                    }
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Không phân khu vực" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Không phân khu vực</SelectItem>
                      {zones.map((z) => (
                        <SelectItem key={z.id} value={z.id.toString()}>
                          {z.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel className="text-sm font-medium">
                      Đang hoạt động
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Bàn có thể nhận đơn hàng
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value ?? true}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? "Đang lưu..."
                  : editingTable !== null
                    ? "Lưu thay đổi"
                    : "Tạo bàn"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── TableCard ─────────────────────────────────────────────────────────────

function TableCard({
  table,
  onEdit,
  onDelete,
  isPending,
}: {
  table: TableRow;
  onEdit: (t: TableRow) => void;
  onDelete: (t: TableRow) => void;
  isPending: boolean;
}) {
  return (
    <div
      className={`relative rounded-lg border p-3 ${
        table.is_active ? "bg-card" : "bg-muted opacity-60"
      }`}
    >
      <p className="truncate text-sm font-medium">{table.name}</p>
      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <Users className="size-3" />
        <span>{table.capacity}</span>
      </div>
      {!table.is_active && (
        <Badge variant="outline" className="mt-1 text-xs">
          Tạm đóng
        </Badge>
      )}

      <div className="mt-2 flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onEdit(table)}
          disabled={isPending}
          aria-label={`Sửa ${table.name}`}
        >
          <Pencil className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive"
          onClick={() => onDelete(table)}
          disabled={isPending}
          aria-label={`Xóa ${table.name}`}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

interface TablesManagerProps {
  branches: BranchRow[];
}

export function TablesManager({ branches }: TablesManagerProps) {
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    branches[0]?.id ?? null,
  );
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [expandedZones, setExpandedZones] = useState<Set<number>>(new Set());
  const [loadingBranch, setLoadingBranch] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Zone dialog
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<ZoneRow | null>(null);

  // Table dialog
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<TableRow | null>(null);
  const [defaultZoneId, setDefaultZoneId] = useState<number | null>(null);

  const [isPending, startTransition] = useTransition();

  async function loadBranchData(branchId: number) {
    setLoadingBranch(true);
    const [zonesResult, tablesResult] = await Promise.all([
      getZones(branchId),
      getTables(branchId),
    ]);
    setLoadingBranch(false);

    if (!zonesResult.success) {
      toast.error(zonesResult.error ?? "Không thể tải khu vực");
      return;
    }
    if (!tablesResult.success) {
      toast.error(tablesResult.error ?? "Không thể tải bàn");
      return;
    }

    const loadedZones = zonesResult.data ?? [];
    setZones(loadedZones);
    setTables(tablesResult.data ?? []);
    setExpandedZones(new Set(loadedZones.map((z) => z.id)));
  }

  // Load initial branch data once
  if (!initialized && selectedBranchId !== null) {
    setInitialized(true);
    void loadBranchData(selectedBranchId);
  }

  function handleBranchChange(value: string) {
    const id = parseInt(value, 10);
    setSelectedBranchId(id);
    setZones([]);
    setTables([]);
    void loadBranchData(id);
  }

  function toggleZoneExpanded(zoneId: number) {
    setExpandedZones((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) {
        next.delete(zoneId);
      } else {
        next.add(zoneId);
      }
      return next;
    });
  }

  // ─── Zone handlers ──────────────────────────────────────────────────────

  function openCreateZone() {
    setEditingZone(null);
    setZoneDialogOpen(true);
  }

  function openEditZone(zone: ZoneRow) {
    setEditingZone(zone);
    setZoneDialogOpen(true);
  }

  function handleZoneSave(values: ZoneFormValues) {
    if (selectedBranchId === null) return;

    startTransition(async () => {
      const result =
        editingZone !== null
          ? await updateZone(editingZone.id, values)
          : await createZone(selectedBranchId, values);

      if (!result.success) {
        toast.error(result.error ?? "Có lỗi xảy ra");
        return;
      }

      const saved = result.data as ZoneRow;
      if (editingZone !== null) {
        setZones((prev) => prev.map((z) => (z.id === saved.id ? saved : z)));
        toast.success("Cập nhật khu vực thành công");
      } else {
        setZones((prev) => [...prev, saved]);
        setExpandedZones((prev) => new Set([...prev, saved.id]));
        toast.success("Tạo khu vực thành công");
      }
      setZoneDialogOpen(false);
    });
  }

  function handleDeleteZone(zone: ZoneRow) {
    const hasTables = tables.some((t) => t.zone_id === zone.id);
    if (hasTables) {
      toast.error(
        "Không thể xóa khu vực còn có bàn. Hãy xóa hoặc chuyển bàn trước.",
      );
      return;
    }

    startTransition(async () => {
      const result = await deleteZone(zone.id);
      if (!result.success) {
        toast.error(result.error ?? "Có lỗi xảy ra");
        return;
      }
      setZones((prev) => prev.filter((z) => z.id !== zone.id));
      toast.success("Đã xóa khu vực");
    });
  }

  // ─── Table handlers ──────────────────────────────────────────────────────

  function openCreateTable(zoneId: number | null = null) {
    setEditingTable(null);
    setDefaultZoneId(zoneId);
    setTableDialogOpen(true);
  }

  function openEditTable(table: TableRow) {
    setEditingTable(table);
    setDefaultZoneId(table.zone_id);
    setTableDialogOpen(true);
  }

  function handleTableSave(values: TableFormValues) {
    if (selectedBranchId === null) return;

    startTransition(async () => {
      const result =
        editingTable !== null
          ? await updateTable(editingTable.id, values)
          : await createTable(selectedBranchId, values);

      if (!result.success) {
        toast.error(result.error ?? "Có lỗi xảy ra");
        return;
      }

      const saved = result.data as TableRow;
      const zoneName =
        zones.find((z) => z.id === saved.zone_id)?.name ?? null;
      const savedWithZone: TableRow = { ...saved, zone_name: zoneName };

      if (editingTable !== null) {
        setTables((prev) =>
          prev.map((t) => (t.id === savedWithZone.id ? savedWithZone : t)),
        );
        toast.success("Cập nhật bàn thành công");
      } else {
        setTables((prev) => [...prev, savedWithZone]);
        toast.success("Tạo bàn thành công");
      }
      setTableDialogOpen(false);
    });
  }

  function handleDeleteTable(table: TableRow) {
    startTransition(async () => {
      const result = await deleteTable(table.id);
      if (!result.success) {
        toast.error(result.error ?? "Có lỗi xảy ra");
        return;
      }
      setTables((prev) => prev.filter((t) => t.id !== table.id));
      toast.success("Đã xóa bàn");
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const unzonedTables = tables.filter((t) => t.zone_id === null);

  return (
    <div className="space-y-6">
      {/* Branch selector */}
      <div className="flex items-center gap-4">
        <div className="w-64">
          <Select
            value={selectedBranchId?.toString() ?? ""}
            onValueChange={handleBranchChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn chi nhánh" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id.toString()}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedBranchId !== null && (
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              onClick={openCreateZone}
              disabled={isPending}
            >
              <Plus className="mr-2 size-4" />
              Thêm khu vực
            </Button>
            <Button
              onClick={() => openCreateTable(null)}
              disabled={isPending}
            >
              <Plus className="mr-2 size-4" />
              Thêm bàn
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      {selectedBranchId === null ? (
        <p className="py-12 text-center text-muted-foreground">
          Chọn chi nhánh để xem bàn và khu vực
        </p>
      ) : loadingBranch ? (
        <p className="py-12 text-center text-muted-foreground">Đang tải...</p>
      ) : (
        <div className="space-y-4">
          {zones.map((zone) => {
            const zoneTables = tables.filter((t) => t.zone_id === zone.id);
            const isExpanded = expandedZones.has(zone.id);

            return (
              <Card key={zone.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleZoneExpanded(zone.id)}
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground" />
                      )}
                      <CardTitle className="text-base">{zone.name}</CardTitle>
                      <Badge variant="secondary" className="ml-1">
                        {zoneTables.length} bàn
                      </Badge>
                      {!zone.is_active && (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground"
                        >
                          Tạm đóng
                        </Badge>
                      )}
                    </button>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openCreateTable(zone.id)}
                        disabled={isPending}
                        aria-label="Thêm bàn vào khu vực"
                      >
                        <Plus className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditZone(zone)}
                        disabled={isPending}
                        aria-label={`Sửa ${zone.name}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteZone(zone)}
                        disabled={isPending}
                        aria-label={`Xóa ${zone.name}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent>
                    {zoneTables.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        Chưa có bàn nào trong khu vực này.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                        {zoneTables.map((table) => (
                          <TableCard
                            key={table.id}
                            table={table}
                            onEdit={openEditTable}
                            onDelete={handleDeleteTable}
                            isPending={isPending}
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}

          {/* Unzoned tables */}
          {(unzonedTables.length > 0 || zones.length === 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-muted-foreground">
                  Chưa phân khu vực
                  <Badge variant="secondary" className="ml-2">
                    {unzonedTables.length} bàn
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {unzonedTables.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Không có bàn nào chưa phân khu vực.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {unzonedTables.map((table) => (
                      <TableCard
                        key={table.id}
                        table={table}
                        onEdit={openEditTable}
                        onDelete={handleDeleteTable}
                        isPending={isPending}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {zones.length === 0 && tables.length === 0 && (
            <p className="py-12 text-center text-muted-foreground">
              Chi nhánh này chưa có khu vực hoặc bàn nào.
            </p>
          )}
        </div>
      )}

      {/* Dialogs */}
      <ZoneDialog
        open={zoneDialogOpen}
        onOpenChange={setZoneDialogOpen}
        editingZone={editingZone}
        defaultSortOrder={zones.length}
        onSave={handleZoneSave}
        isPending={isPending}
      />

      <TableDialog
        open={tableDialogOpen}
        onOpenChange={setTableDialogOpen}
        editingTable={editingTable}
        defaultZoneId={defaultZoneId}
        zones={zones}
        onSave={handleTableSave}
        isPending={isPending}
      />
    </div>
  );
}
