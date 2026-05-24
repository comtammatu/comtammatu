"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Send } from "lucide-react";
import { createTelegramDestinationSchema } from "@comtammatu/shared/feedback";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { TextField } from "@/components/form/text-field";
import {
  createTelegramDestination,
  toggleTelegramDestination,
  deleteTelegramDestination,
  sendTestTelegram,
} from "../actions";

type CreateDestInput = z.input<typeof createTelegramDestinationSchema>;

export interface TelegramDestRow {
  id: number;
  chat_id: string;
  label: string;
  branch_name: string | null;
  is_active: boolean;
  created_at: string;
}

interface TelegramDestinationsClientProps {
  destinations: TelegramDestRow[];
}

export function TelegramDestinationsClient({
  destinations,
}: TelegramDestinationsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createError, setCreateError] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const { control, handleSubmit, reset } = useForm<CreateDestInput>({
    resolver: zodResolver(createTelegramDestinationSchema),
    defaultValues: { branch_id: null, chat_id: "", label: "" },
  });

  function handleCreate(data: CreateDestInput) {
    setCreateError(null);
    startTransition(async () => {
      const result = await createTelegramDestination(data);
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
      await toggleTelegramDestination({ id, is_active: !is_active });
      router.refresh();
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteTelegramDestination(id);
      router.refresh();
    });
  }

  function handleTest(id: number) {
    setTestMessage(null);
    startTransition(async () => {
      const result = await sendTestTelegram(id);
      setTestMessage(
        result.success
          ? "Gửi thành công! Kiểm tra Telegram của bạn."
          : (result.error ?? "Gửi thất bại."),
      );
    });
  }

  return (
    <div className="space-y-6">
      {/* Create form */}
      <form
        onSubmit={handleSubmit(handleCreate)}
        className="rounded-lg border p-4"
      >
        <h2 className="mb-4 font-medium">Thêm Telegram destination</h2>
        {createError ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{createError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            control={control}
            name="chat_id"
            label="Chat ID"
            placeholder="-100123456789"
            required
          />
          <TextField
            control={control}
            name="label"
            label="Nhãn"
            placeholder="HQ Alert, Chi nhánh Q1..."
            required
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Cách lấy chat_id: thêm @CTMTFeedbackBot vào group, gõ /start, copy chat_id từ message của bot.
        </p>
        <div className="mt-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Đang thêm..." : "Thêm destination"}
          </Button>
        </div>
      </form>

      {testMessage ? (
        <Alert>
          <AlertDescription>{testMessage}</AlertDescription>
        </Alert>
      ) : null}

      {/* Destinations table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Chat ID</TableHead>
              <TableHead>Nhãn</TableHead>
              <TableHead>Chi nhánh</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {destinations.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-sm text-muted-foreground"
                >
                  Chưa có destination nào
                </TableCell>
              </TableRow>
            ) : (
              destinations.map((dest) => (
                <TableRow key={dest.id}>
                  <TableCell className="font-mono text-xs">
                    {dest.chat_id.slice(0, 20)}
                    {dest.chat_id.length > 20 ? "…" : ""}
                  </TableCell>
                  <TableCell className="text-sm">{dest.label}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {dest.branch_name ?? "HQ (tất cả)"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={dest.is_active ? "default" : "secondary"}>
                      {dest.is_active ? "Hoạt động" : "Tắt"}
                    </Badge>
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
                        <DropdownMenuItem onSelect={() => handleTest(dest.id)}>
                          <Send className="mr-2 size-4" />
                          Gửi tin nhắn test
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            handleToggle(dest.id, dest.is_active)
                          }
                        >
                          {dest.is_active ? "Vô hiệu hóa" : "Kích hoạt"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => handleDelete(dest.id)}
                          className="text-destructive"
                        >
                          Xoá
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
        AI settings sẽ có ở Slice 2.
      </p>
    </div>
  );
}
