"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Kbd, KbdGroup } from "@comtammatu/ui/components/kbd";
import { Separator } from "@comtammatu/ui/components/separator";
import { POS_VI } from "@comtammatu/shared/messages";

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
    title: POS_VI.hotkeyGroupOrder,
    rows: [
      { keys: ["⌘", "Enter"], label: POS_VI.hotkeySubmitKitchen },
      { keys: ["T"], label: POS_VI.hotkeyToTakeaway },
      { keys: ["D"], label: POS_VI.hotkeyToDineIn },
      { keys: ["F2"], label: POS_VI.hotkeyToggleServiceMode },
      { keys: ["F9"], label: POS_VI.hotkeyPayOpenOrder },
    ],
  },
  {
    title: POS_VI.hotkeyGroupSearchTable,
    rows: [{ keys: ["F4"], label: POS_VI.hotkeyFocusSearch }],
  },
  {
    title: POS_VI.hotkeyGroupShift,
    rows: [
      { keys: ["F10"], label: POS_VI.hotkeyOpenCloseShift },
      { keys: ["Esc"], label: POS_VI.hotkeyCloseSheet },
    ],
  },
  {
    title: POS_VI.hotkeyGroupHelp,
    rows: [{ keys: ["?"], label: POS_VI.hotkeyToggleOverlay }],
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
          <SheetHeader>
            <SheetTitle>{POS_VI.hotkeyOverlayTitle}</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="grid gap-6 md:grid-cols-2">
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
