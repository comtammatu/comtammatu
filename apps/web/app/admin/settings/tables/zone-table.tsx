"use client";

import { useState, useTransition } from "react";
import { Ellipsis as IconDots, Pencil as IconPencil, Trash as IconTrash, MapPin as IconMapPin } from "lucide-react";
import { ACTIONS_VI, STATES_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@comtammatu/ui/components/alert-dialog";
import { deleteZone } from "./actions";
import { ZoneFormDialog } from "./zone-form-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { TableEmptyStateRow } from "../../components/table-empty-state-row";

export interface ZoneRow {
  id: number;
  branch_id: number;
  name: string;
  sort_order: number;
}

interface ZoneTableProps {
  zones: ZoneRow[];
}

export function ZoneTable({ zones }: ZoneTableProps) {
  const [editZone, setEditZone] = useState<ZoneRow | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: number) {
    startTransition(async () => {
      const result = await deleteZone({ id });
      if (!result.success) {
        toast.error(result.error);
      } else {
        toast.success(`${STATES_VI.deleted} khu vực`);
      }
      setDeleteId(null);
    });
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên khu vực</TableHead>
              <TableHead className="hidden md:table-cell">Thứ tự</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {zones.length === 0 && (
              <TableEmptyStateRow
                colSpan={3}
                title="Chưa có khu vực nào"
                icon={
                  <IconMapPin className="mx-auto size-8 text-muted-foreground" />
                }
              />
            )}
            {zones.map((zone) => (
              <TableRow key={zone.id} className={isPending ? "opacity-60" : ""}>
                <TableCell>
                  <span className="font-medium">{zone.name}</span>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {zone.sort_order}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-lg">
                        <IconDots className="size-4" />
                        <span className="sr-only">Menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditZone(zone)}>
                        <IconPencil className="mr-2 size-4" />
                        {ACTIONS_VI.edit}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteId(zone.id)}
                      >
                        <IconTrash className="mr-2 size-4" />
                        {ACTIONS_VI.delete}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editZone && (
        <ZoneFormDialog
          open={!!editZone}
          onOpenChange={(open) => !open && setEditZone(null)}
          branchId={editZone.branch_id}
          zone={editZone}
        />
      )}

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa khu vực?</AlertDialogTitle>
            <AlertDialogDescription>
              Khu vực sẽ bị xóa vĩnh viễn. Các bàn thuộc khu vực này sẽ không
              còn khu vực.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{ACTIONS_VI.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isPending}
              onClick={() => deleteId !== null && handleDelete(deleteId)}
            >
              {ACTIONS_VI.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
