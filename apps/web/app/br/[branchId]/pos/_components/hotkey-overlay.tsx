"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Kbd, KbdGroup } from "@comtammatu/ui/components/kbd";
import { Separator } from "@comtammatu/ui/components/separator";

interface HotkeyRow {
  keys: string[];
  label: string;
}

interface HotkeyGroup {
  title: string;
  rows: HotkeyRow[];
}

const GROUPS: HotkeyGroup[] = [
  {
    title: "Đơn",
    rows: [
      { keys: ["⌘", "Enter"], label: "Gửi bếp (từ giỏ)" },
      { keys: ["T"], label: "Chuyển sang mang về" },
      { keys: ["D"], label: "Chuyển sang tại bàn" },
      { keys: ["F2"], label: "Đổi mang về / tại bàn" },
      { keys: ["F9"], label: "Thanh toán đơn đang mở" },
    ],
  },
  {
    title: "Tìm kiếm & chọn bàn",
    rows: [
      { keys: ["F4"], label: "Focus ô tìm món" },
      { keys: ["1", "–", "9"], label: "Chọn bàn nhanh (đang phát triển)" },
    ],
  },
  {
    title: "Ca làm",
    rows: [
      { keys: ["F10"], label: "Mở sheet đóng ca" },
      { keys: ["Esc"], label: "Đóng sheet / hủy thao tác" },
    ],
  },
  {
    title: "Trợ giúp",
    rows: [{ keys: ["?"], label: "Mở / đóng bảng phím tắt" }],
  },
];

interface HotkeyOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HotkeyOverlay({ open, onOpenChange }: HotkeyOverlayProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-dvh p-0">
        <div className="flex max-h-dvh flex-col overflow-hidden">
          <SheetHeader className="border-b px-5 pt-5 pb-3 text-left">
            <SheetTitle>Phím tắt POS</SheetTitle>
            <SheetDescription>
              Dùng bàn phím để thao tác nhanh hơn. Phím không áp dụng khi đang
              gõ trong ô nhập (ngoại trừ ⌘/Ctrl + Enter).
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="grid gap-5 md:grid-cols-2">
              {GROUPS.map((group, idx) => (
                <div key={group.title} className="flex flex-col gap-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {group.title}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {group.rows.map((row) => (
                      <li
                        key={row.label}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-sm">{row.label}</span>
                        <KbdGroup>
                          {row.keys.map((k, i) => (
                            <Kbd key={`${row.label}-${String(i)}`}>{k}</Kbd>
                          ))}
                        </KbdGroup>
                      </li>
                    ))}
                  </ul>
                  {idx < GROUPS.length - 1 && (
                    <Separator className="md:hidden" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
