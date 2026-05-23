"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Copy, RotateCcw, MoreHorizontal, Pencil } from "lucide-react";
import { createQrCodeSchema } from "@comtammatu/shared/feedback";
import { formatVNDate } from "@comtammatu/shared/time";
import type { z } from "zod";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { SelectField } from "@/components/form/select-field";
import {
  createQrCode,
  toggleQrCode,
  rotateQrCode,
  updateQrCodeLabel,
} from "../actions";

type CreateQrInput = z.input<typeof createQrCodeSchema>;

export interface QrCodeRow {
  id: number;
  token: string;
  label: string;
  branch_id: number;
  branch_name: string;
  is_active: boolean;
  created_at: string;
}

export interface BranchOption {
  id: number;
  name: string;
}

interface QrManagementClientProps {
  qrCodes: QrCodeRow[];
  branches: BranchOption[];
}

function TokenCell({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="font-mono text-xs hover:text-primary"
      title="Click để sao chép"
      onClick={() => {
        void navigator.clipboard.writeText(token).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      <Copy className="mr-1 inline size-3" />
      {copied ? "Đã sao chép!" : token}
    </button>
  );
}

export function QrManagementClient({
  qrCodes,
  branches,
}: QrManagementClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createError, setCreateError] = useState<string | null>(null);
  const [rotateTarget, setRotateTarget] = useState<QrCodeRow | null>(null);
  const [renameTarget, setRenameTarget] = useState<QrCodeRow | null>(null);
  const [renameLabel, setRenameLabel] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const branchOptions = branches.map((b) => ({
    value: String(b.id),
    label: b.name,
  }));

  const { control, handleSubmit, reset, watch } = useForm<CreateQrInput>({
    resolver: zodResolver(createQrCodeSchema),
    defaultValues: {
      branch_id: undefined as unknown as number,
      table_id: null,
    },
  });
  // Watch branch_id directly — react-hook-form's `isValid` defaults to true
  // until the first validation runs, which means the submit button stays
  // enabled at mount even though the form has no branch_id selected. Reading
  // the field value directly is a reliable gate that updates on every change.
  const branchId = watch("branch_id");

  function handleCreate(data: CreateQrInput) {
    setCreateError(null);
    startTransition(async () => {
      const result = await createQrCode(data);
      if (!result.success) {
        setCreateError(result.error ?? "Có lỗi xảy ra");
        return;
      }
      reset();
      router.refresh();
    });
  }

  function handleToggle(id: number, is_active: boolean) {
    startTransition(async () => {
      await toggleQrCode({ id, is_active: !is_active });
      router.refresh();
    });
  }

  function handleRotateConfirm() {
    if (!rotateTarget) return;
    const id = rotateTarget.id;
    setActionError(null);
    startTransition(async () => {
      const result = await rotateQrCode({ id });
      if (!result.success) {
        setActionError(result.error ?? "Có lỗi xảy ra");
      } else {
        setRotateTarget(null);
        router.refresh();
      }
    });
  }

  function handleRenameConfirm() {
    if (!renameTarget) return;
    const id = renameTarget.id;
    setActionError(null);
    startTransition(async () => {
      const result = await updateQrCodeLabel({ id, label: renameLabel });
      if (!result.success) {
        setActionError(result.error ?? "Có lỗi xảy ra");
      } else {
        setRenameTarget(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Create QR form */}
      <form
        onSubmit={handleSubmit(handleCreate)}
        className="rounded-lg border p-4"
      >
        <h2 className="mb-4 font-medium">Tạo QR mới</h2>
        {createError ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{createError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <div className="min-w-48 flex-1">
            <SelectField
              control={control}
              name="branch_id"
              label="Chi nhánh"
              options={branchOptions}
              placeholder="Chọn chi nhánh"
              required
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={isPending || !branchId}>
              {isPending ? "Đang tạo..." : "Tạo QR"}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Nhãn QR sẽ được tự động tạo. Table ID sẽ có ở Slice 3.
        </p>
      </form>

      {/* QR table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Token</TableHead>
              <TableHead>Nhãn</TableHead>
              <TableHead>Chi nhánh</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Tạo lúc</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {qrCodes.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground"
                >
                  Chưa có QR nào
                </TableCell>
              </TableRow>
            ) : (
              qrCodes.map((qr) => (
                <TableRow key={qr.id}>
                  <TableCell>
                    <TokenCell token={qr.token} />
                  </TableCell>
                  <TableCell className="text-sm">{qr.label}</TableCell>
                  <TableCell className="text-sm">{qr.branch_name}</TableCell>
                  <TableCell>
                    <Badge variant={qr.is_active ? "default" : "secondary"}>
                      {qr.is_active ? "Hoạt động" : "Tắt"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatVNDate(qr.created_at)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Tùy chọn</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setRenameTarget(qr);
                            setRenameLabel(qr.label);
                            setActionError(null);
                          }}
                        >
                          <Pencil className="mr-2 size-4" />
                          Đổi tên nhãn
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => handleToggle(qr.id, qr.is_active)}
                        >
                          {qr.is_active ? "Vô hiệu hóa" : "Kích hoạt"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            setRotateTarget(qr);
                            setActionError(null);
                          }}
                          className="text-destructive"
                        >
                          <RotateCcw className="mr-2 size-4" />
                          Xoay token
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">
        <Button variant="outline" size="sm" disabled>
          In PDF (Slice 3)
        </Button>
      </p>

      {/* Rotate confirmation dialog */}
      <Dialog
        open={!!rotateTarget}
        onOpenChange={(open) => {
          if (!open) setRotateTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xoay token QR</DialogTitle>
            <DialogDescription>
              Tất cả QR đã in với token cũ sẽ ngừng hoạt động ngay lập tức. Bạn
              có chắc muốn tiếp tục?
            </DialogDescription>
          </DialogHeader>
          {actionError ? (
            <Alert variant="destructive">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRotateTarget(null)}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              onClick={handleRotateConfirm}
              disabled={isPending}
            >
              {isPending ? "Đang xoay..." : "Xác nhận xoay token"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đổi tên nhãn QR</DialogTitle>
          </DialogHeader>
          {actionError ? (
            <Alert variant="destructive">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="py-2">
            <label
              htmlFor="rename-label"
              className="mb-1 block text-sm font-medium"
            >
              Nhãn mới
            </label>
            <input
              id="rename-label"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={renameLabel}
              onChange={(e) => setRenameLabel(e.target.value)}
              maxLength={200}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Huỷ
            </Button>
            <Button
              onClick={handleRenameConfirm}
              disabled={isPending || !renameLabel.trim()}
            >
              {isPending ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
