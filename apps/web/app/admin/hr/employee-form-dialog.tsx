"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { createEmployee } from "./actions";

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmployeeFormDialog({
  open,
  onOpenChange,
}: EmployeeFormDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [contractType, setContractType] = useState<string>("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      setError(null);
      const result = await createEmployee({
        profileId: fd.get("profileId") as string,
        employeeCode: (fd.get("employeeCode") as string) || undefined,
        idNumber: (fd.get("idNumber") as string) || undefined,
        bankAccount: (fd.get("bankAccount") as string) || undefined,
        bankName: (fd.get("bankName") as string) || undefined,
        baseSalary: fd.get("baseSalary")
          ? Number(fd.get("baseSalary"))
          : undefined,
        startDate: (fd.get("startDate") as string) || undefined,
        contractType: contractType as
          | "probation"
          | "fixed_term"
          | "indefinite"
          | undefined,
        dependentsCount: fd.get("dependentsCount")
          ? Number(fd.get("dependentsCount"))
          : 0,
      });
      if (!result.success) {
        setError(result.error ?? "Đã xảy ra lỗi");
        return;
      }
      toast.success("Đã tạo hồ sơ nhân viên mới");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm hồ sơ nhân viên</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="emp-profileId">Profile UUID *</Label>
            <Input
              id="emp-profileId"
              name="profileId"
              required
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
            <p className="text-xs text-muted-foreground">
              Nhập UUID từ trang Nhân sự (tab Nhân viên → ID của profile)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="emp-code">Mã nhân viên</Label>
              <Input id="emp-code" name="employeeCode" placeholder="NV001" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-id">Số CCCD / CMND</Label>
              <Input id="emp-id" name="idNumber" placeholder="012345678901" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="emp-bank">Số tài khoản</Label>
              <Input
                id="emp-bank"
                name="bankAccount"
                placeholder="1234567890"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-bankname">Ngân hàng</Label>
              <Input
                id="emp-bankname"
                name="bankName"
                placeholder="Vietcombank"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="emp-salary">Lương cơ bản (VND)</Label>
              <Input
                id="emp-salary"
                name="baseSalary"
                type="number"
                min="0"
                placeholder="5000000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-deps">Số người phụ thuộc</Label>
              <Input
                id="emp-deps"
                name="dependentsCount"
                type="number"
                min="0"
                defaultValue="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="emp-start">Ngày bắt đầu</Label>
              <Input id="emp-start" name="startDate" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emp-contract">Loại hợp đồng</Label>
              <Select value={contractType} onValueChange={setContractType}>
                <SelectTrigger id="emp-contract">
                  <SelectValue placeholder="Chọn loại HĐ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="probation">Thử việc</SelectItem>
                  <SelectItem value="fixed_term">Có thời hạn</SelectItem>
                  <SelectItem value="indefinite">Không thời hạn</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

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
              {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Tạo hồ sơ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
