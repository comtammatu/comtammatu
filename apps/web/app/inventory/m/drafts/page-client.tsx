"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ClipboardList as IconClipboardList, Pencil as IconPencil, Trash as IconTrash } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { MobileEmptyState } from "../../_components/mobile/mobile-empty-state";
import { MobilePage } from "../../_components/mobile/mobile-page";
import { MobileSectionHeader } from "../../_components/mobile/mobile-section-header";
import {
  draftTotal,
  listDrafts,
  removeDraft,
  type GrnDraft,
} from "../../_lib/mobile-draft";
import { formatVND } from "../../_lib/format";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function MobileDraftsClient({ userKey }: { userKey: string }) {
  const router = useRouter();
  const [drafts, setDrafts] = React.useState<GrnDraft[]>([]);

  const reloadDrafts = React.useCallback(() => {
    setDrafts(listDrafts(userKey));
  }, [userKey]);

  React.useEffect(() => {
    reloadDrafts();
  }, [reloadDrafts]);

  function openDraft(draft: GrnDraft) {
    try {
      window.localStorage.setItem(
        `active-grn:${userKey}:${draft.supplierId}`,
        draft.draftId,
      );
    } catch {
      /* ignore */
    }
    router.push(`/inventory/m/grn/new/${draft.supplierId}`);
  }

  function discardDraft(draft: GrnDraft) {
    if (!window.confirm(`Xóa nháp của ${draft.supplierName}?`)) return;
    removeDraft(userKey, draft.draftId);
    reloadDrafts();
  }

  return (
    <MobilePage>
      <MobileSectionHeader
        backHref="/inventory/m"
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
            <Card key={draft.draftId} className="border bg-card shadow-sm">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">
                      {draft.supplierName}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Cập nhật lúc {formatUpdatedAt(draft.updatedAt)}
                    </p>
                  </div>
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    {draft.lines.length} dòng
                  </Badge>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Tổng tạm tính
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {formatVND(draftTotal(draft))} đ
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Nhà cung cấp
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                      {draft.supplierName}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    onClick={() => openDraft(draft)}
                  >
                    <IconPencil className="size-4" />
                    Tiếp tục
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => discardDraft(draft)}
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
