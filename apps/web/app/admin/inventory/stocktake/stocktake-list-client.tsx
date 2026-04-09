"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ClipboardCheck, Plus, Search } from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { createStocktakeSession, fetchStocktakeSessions } from "../actions";
import { TableEmptyStateRow } from "../../components/table-empty-state-row";

export interface StocktakeSessionRow {
  id: number;
  branch_id: number;
  started_at: string | null;
  completed_at: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  created_by: string;
  branches: { id: number; name: string } | null;
}

export interface BranchOption {
  id: number;
  name: string;
  is_active: boolean;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  in_progress: {
    label: "Dang thu\u0301c hie\u0323n",
    className: "bg-warning/10 text-warning border-warning/30",
  },
  completed: {
    label: "Hoa\u0300n ta\u0301t",
    className: "bg-success/10 text-success border-success/30",
  },
  cancelled: {
    label: "Da\u0303 hu\u0309y",
    className: "bg-muted text-muted-foreground",
  },
};

export function StocktakeListClient({
  initial,
  branches,
  userRole,
  userBranchId,
}: {
  initial: StocktakeSessionRow[];
  branches: BranchOption[];
  userRole: StaffRole;
  userBranchId: number | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState("");

  const isBranchManager = userRole === "branch_manager";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        `KK-${r.id}`.toLowerCase().includes(q) ||
        (r.branches?.name ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  function handleCreate() {
    if (isBranchManager && userBranchId != null) {
      doCreate(userBranchId);
    } else {
      setSelectedBranchId("");
      setDialogOpen(true);
    }
  }

  function doCreate(branchId: number) {
    startTransition(async () => {
      const res = await createStocktakeSession(branchId);
      if (!res.success) {
        toast.error(
          res.error ?? "Khong the\u0309 ta\u0323o phien kie\u0309m ke\u0302.",
        );
        return;
      }
      toast.success("Da\u0303 ta\u0323o phien kie\u0309m ke\u0302");
      setDialogOpen(false);
      const again = await fetchStocktakeSessions();
      if (again.success) setRows((again.data ?? []) as StocktakeSessionRow[]);
      const id = (res.data as { id: number }).id;
      router.push(`/admin/inventory/stocktake/${id}`);
    });
  }

  function handleDialogConfirm() {
    const bid = Number(selectedBranchId);
    if (!bid) {
      toast.error("Cho\u0323n chi nha\u0301nh");
      return;
    }
    doCreate(bid);
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Kie\u0309m ke\u0302 kho
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ta\u0323o phien kie\u0309m ke\u0302, de\u0301m thu\u0309c te\u0301
            va\u0300 doi chi\u0301nh xe\u0301ch kho.
          </p>
        </div>
        <Button type="button" onClick={handleCreate} disabled={isPending}>
          <Plus className="mr-2 size-4" />
          Ta\u0323o kie\u0309m ke\u0302
        </Button>
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-lg border shadow-sm">
        {/* Search bar */}
        <div className="flex items-center gap-3 border-b bg-muted/20 px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            placeholder="Ti\u0300m ma\u0303 phien hoa\u0323c ten chi nha\u0301nh\u2026"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          />
          <span className="shrink-0 text-xs text-muted-foreground">
            {filtered.length} / {rows.length}
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Ma\u0303 phien
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Chi nha\u0301nh
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Nga\u0300y ba\u0309t da\u0300u
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Tra\u0323ng tha\u0301i
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableEmptyStateRow
                colSpan={5}
                paddingClassName="py-16"
                icon={
                  <ClipboardCheck className="mx-auto size-10 text-muted-foreground/40" />
                }
                title={
                  search
                    ? "Khong ti\u0300m tha\u0301y phien na\u0300o"
                    : "Chu\u031ba co\u0301 phien kie\u0309m ke\u0302 na\u0300o"
                }
                description={
                  search
                    ? "Thu\u0309 tu\u0300 kho\u0301a kha\u0301c"
                    : 'Nha\u0301n "Ta\u0323o kie\u0309m ke\u0302" de\u0309 ba\u0309t da\u0300u'
                }
              />
            )}
            {filtered.map((r) => {
              const meta = STATUS_META[r.status] ?? {
                label: r.status,
                className: "bg-muted text-muted-foreground",
              };

              return (
                <TableRow
                  key={r.id}
                  className="group transition-colors hover:bg-muted/30"
                >
                  <TableCell className="font-mono text-sm font-medium">
                    KK-{r.id}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.branches?.name ?? "\u2014"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {r.started_at
                      ? new Date(r.started_at).toLocaleDateString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })
                      : r.created_at
                        ? new Date(r.created_at).toLocaleDateString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })
                        : "\u2014"}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("text-xs", meta.className)}>
                      {meta.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 opacity-0 transition-opacity group-hover:opacity-100"
                      asChild
                    >
                      <Link href={`/admin/inventory/stocktake/${r.id}`}>
                        <ArrowRight className="size-4" />
                        <span className="sr-only">Chi tie\u0301t</span>
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Branch select dialog for super_manager */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Cho\u0323n chi nha\u0301nh kie\u0309m ke\u0302
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="branch-select">Chi nha\u0301nh</Label>
            <Select
              value={selectedBranchId}
              onValueChange={setSelectedBranchId}
            >
              <SelectTrigger id="branch-select">
                <SelectValue placeholder="Cho\u0323n chi nha\u0301nh..." />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isPending}
            >
              Hu\u0309y
            </Button>
            <Button
              onClick={handleDialogConfirm}
              disabled={isPending || !selectedBranchId}
            >
              {isPending ? "Dang ta\u0323o..." : "Ta\u0323o phien"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
