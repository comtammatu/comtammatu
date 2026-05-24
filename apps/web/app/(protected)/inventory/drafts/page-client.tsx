"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList as IconClipboardList,
  Pencil as IconPencil,
  Trash as IconTrash,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { MobileEmptyState } from "../_components/mobile/mobile-empty-state";
import { MobilePage } from "../_components/mobile/mobile-page";
import { MobileSectionHeader } from "../_components/mobile/mobile-section-header";
import { discardGrnDraft } from "../grn-actions";

import { ACTIONS_VI } from "@comtammatu/shared/messages";

export type ServerDraftRow = {
  grnId: number;
  supplierId: number;
  supplierName: string;
  grnNumber: string;
  updatedAt: string;
  lineCount: number;
};

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function MobileDraftsClient({ drafts }: { drafts: ServerDraftRow[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  function openDraft(draft: ServerDraftRow) {
    // Server-side draft is loaded by /grn/new/[supplierId]/page.tsx via
    // loadActiveGrnDraft + fetchGrnDetail RSC pre-fetch — no client-side
    // handoff needed.
    router.push(`/inventory/grn/new/${draft.supplierId}`);
  }

  async function handleDiscard(draft: ServerDraftRow) {
    if (!window.confirm(`Xóa nháp của ${draft.supplierName}?`)) return;
    setPending(true);
    try {
      const res = await discardGrnDraft({ grnId: draft.grnId });
      if (!res.success) {
        window.alert(res.error ?? "Không thể hủy phiếu nháp.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <MobilePage>
      <MobileSectionHeader
        backHref="/inventory"
        backLabel="Trang chính"
        eyebrow="Phiếu nhập"
        title="Phiếu nháp đã lưu"
        description="Mở lại phiếu nhập đang làm dở theo nhà cung cấp."
      />

      {drafts.length === 0 ? (
        <MobileEmptyState
          icon={IconClipboardList}
          title="Chưa có phiếu nháp"
          description="Bắt đầu tạo phiếu nhập để hệ thống lưu lại tiến độ cho bạn."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {drafts.map((draft) => (
            <Card key={draft.grnId} className="border bg-card shadow-sm">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">
                      {draft.supplierName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {draft.grnNumber}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Cập nhật lúc {formatUpdatedAt(draft.updatedAt)}
                    </p>
                  </div>
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    {draft.lineCount} dòng
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    onClick={() => openDraft(draft)}
                    disabled={pending}
                  >
                    <IconPencil className="size-4" />
                    Tiếp tục
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleDiscard(draft)}
                    disabled={pending}
                  >
                    <IconTrash className="size-4" />
                    {ACTIONS_VI.delete}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </MobilePage>
  );
}
