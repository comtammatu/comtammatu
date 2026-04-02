"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Switch } from "@comtammatu/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import {
  createBranch,
  updateBranch,
  toggleBranchActive,
} from "./actions";

type Branch = {
  id: number;
  tenant_id: number;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  is_headquarters: boolean;
  created_at: string;
  updated_at: string;
};

const branchFormSchema = z.object({
  name: z.string().min(1, { error: "Tên chi nhánh không được để trống" }),
  address: z.string().optional(),
  phone: z.string().optional(),
  is_headquarters: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

type BranchFormValues = z.infer<typeof branchFormSchema>;

interface BranchListProps {
  initialBranches: Branch[];
}

export function BranchList({ initialBranches }: BranchListProps) {
  const [branches, setBranches] = useState<Branch[]>(initialBranches);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<BranchFormValues>({
    resolver: zodResolver(branchFormSchema),
    defaultValues: {
      name: "",
      address: "",
      phone: "",
      is_headquarters: false,
      is_active: true,
    },
  });

  function openCreate() {
    setEditingBranch(null);
    form.reset({
      name: "",
      address: "",
      phone: "",
      is_headquarters: false,
      is_active: true,
    });
    setDialogOpen(true);
  }

  function openEdit(branch: Branch) {
    setEditingBranch(branch);
    form.reset({
      name: branch.name,
      address: branch.address ?? "",
      phone: branch.phone ?? "",
      is_headquarters: branch.is_headquarters,
      is_active: branch.is_active,
    });
    setDialogOpen(true);
  }

  function onSubmit(values: BranchFormValues) {
    startTransition(async () => {
      const result =
        editingBranch !== null
          ? await updateBranch(editingBranch.id, values)
          : await createBranch(values);

      if (!result.success) {
        toast.error(result.error ?? "Có lỗi xảy ra");
        return;
      }

      const saved = result.data as Branch;

      if (editingBranch !== null) {
        setBranches((prev) =>
          prev.map((b) => (b.id === saved.id ? saved : b)),
        );
        toast.success("Cập nhật chi nhánh thành công");
      } else {
        setBranches((prev) => [...prev, saved]);
        toast.success("Tạo chi nhánh thành công");
      }

      setDialogOpen(false);
    });
  }

  function handleToggleActive(branch: Branch, value: boolean) {
    startTransition(async () => {
      const result = await toggleBranchActive(branch.id, value);
      if (!result.success) {
        toast.error(result.error ?? "Có lỗi xảy ra");
        return;
      }
      setBranches((prev) =>
        prev.map((b) => (b.id === branch.id ? { ...b, is_active: value } : b)),
      );
    });
  }

  return (
    <>
      <div className="flex items-center justify-end">
        <Button onClick={openCreate}>
          <Plus className="mr-2 size-4" />
          Thêm chi nhánh
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên chi nhánh</TableHead>
              <TableHead>Địa chỉ</TableHead>
              <TableHead>Số điện thoại</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-12 text-center text-muted-foreground"
                >
                  Chưa có chi nhánh nào. Hãy thêm chi nhánh đầu tiên.
                </TableCell>
              </TableRow>
            ) : (
              branches.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell className="font-medium">{branch.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {branch.address ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {branch.phone ?? "—"}
                  </TableCell>
                  <TableCell>
                    {branch.is_headquarters && (
                      <Badge variant="secondary">Trụ sở chính</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={branch.is_active}
                      onCheckedChange={(value) =>
                        handleToggleActive(branch, value)
                      }
                      disabled={isPending}
                      aria-label={`Trạng thái ${branch.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(branch)}
                      aria-label={`Sửa ${branch.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {editingBranch !== null ? "Sửa chi nhánh" : "Thêm chi nhánh"}
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên chi nhánh *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ví dụ: Chi nhánh Quận 1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Địa chỉ</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Số nhà, đường, quận, thành phố"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Số điện thoại</FormLabel>
                    <FormControl>
                      <Input placeholder="0909 123 456" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_headquarters"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel className="text-sm font-medium">
                        Trụ sở chính
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Đánh dấu đây là trụ sở chính của công ty
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
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
                        Chi nhánh có thể nhận đơn hàng
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
                  onClick={() => setDialogOpen(false)}
                  disabled={isPending}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending
                    ? "Đang lưu..."
                    : editingBranch !== null
                      ? "Lưu thay đổi"
                      : "Tạo chi nhánh"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
