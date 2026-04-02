"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, Trash2, MapPin } from "lucide-react";
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
      const result = await deleteZone(id);
      if (!result.success) {
        toast.error(result.error);
      } else {
        toast.success("Đã xóa khu vực");
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
              <TableRow>
                <TableCell colSpan={3} className="py-12 text-center">
                  <MapPin className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Chưa có khu vực nào
                  </p>
                </TableCell>
              </TableRow>
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
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditZone(zone)}>
                        <Pencil className="mr-2 size-4" />
                        Sửa
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteId(zone.id)}
                      >
                        <Trash2 className="mr-2 size-4" />
                        Xóa
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
            <AlertDialogCancel disabled={isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={() => deleteId !== null && handleDelete(deleteId)}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
