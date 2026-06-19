"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: inventory draft review surface keeps operational copy inline */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList as IconClipboardList,
  Pencil as IconPencil,
  Trash as IconTrash,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppEmptyState } from "@/components/surface";
import { MobilePage } from "../_components/mobile/mobile-page";
import { MobileSectionHeader } from "../_components/mobile/mobile-section-header";
import { discardGrnDraft } from "../grn-actions";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatVNDateTime } from "@comtammatu/shared/time";

export type ServerDraftRow = {
  grnId: number;
  supplierId: number;
  supplierName: string;
  grnNumber: string;
  updatedAt: string;
  lineCount: number;
};

function formatUpdatedAt(value: string): string {
  return formatVNDateTime(value);
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
    const ok = await confirm({
      title: `Xóa nháp của ${draft.supplierName}?`,
      variant: "destructive",
    });
    if (!ok) return;
    setPending(true);
    try {
      const res = await discardGrnDraft({ grnId: draft.grnId });
      if (!res.success) {
        toast.error(res.error ?? "Không thể hủy phiếu nháp.");
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
        <AppEmptyState
          compact
          icon={<IconClipboardList />}
          title="Chưa có phiếu nháp"
          description="Bắt đầu tạo phiếu nhập để hệ thống lưu lại tiến độ cho bạn."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {drafts.map((draft) => (
            <Item key={draft.grnId} variant="outline" className="bg-card p-4">
              <ItemHeader>
                <div className="min-w-0">
                  <ItemTitle className="text-base">
                    {draft.supplierName}
                  </ItemTitle>
                  <ItemDescription>{draft.grnNumber}</ItemDescription>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cập nhật lúc {formatUpdatedAt(draft.updatedAt)}
                  </p>
                </div>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {draft.lineCount} dòng
                </Badge>
              </ItemHeader>

              <ItemContent className="hidden" />
              <ItemFooter>
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
              </ItemFooter>
            </Item>
          ))}
        </div>
      )}
    </MobilePage>
  );
}
