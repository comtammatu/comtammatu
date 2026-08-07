/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: branch home uses vietnamese */
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search as IconSearch, ShieldAlert } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@comtammatu/ui/components/drawer";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Badge } from "@comtammatu/ui/components/badge";
import { Switch } from "@comtammatu/ui/components/switch";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppEmptyState } from "@/components/surface";
import { formatVND } from "@comtammatu/shared/format";
import { normalizeSearch } from "@lib/search";
import { messages } from "@lib/messages";
import {
  fetchBranchMenuDailyLimits,
  setBranchMenuDailyLimit,
  type MenuLimitRow,
} from "../../menu-limits/actions";

interface Props {
  branchId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BranchQuickMenuLimitSheet({
  branchId,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MenuLimitRow[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;

    let mounted = true;
    setLoading(true);
    fetchBranchMenuDailyLimits(branchId).then((res) => {
      if (!mounted) return;
      setLoading(false);
      if (res.success && res.data) {
        setRows(res.data);
      } else {
        toast.error(res.error ?? messages.pos.menu.loadMenuLimitsFailed);
      }
    });

    return () => {
      mounted = false;
    };
  }, [open, branchId]);

  const filteredRows = rows.filter((row) => {
    if (!query.trim()) return true;
    const needle = normalizeSearch(query).trim();
    const haystack = normalizeSearch(`${row.item_name} ${row.category_name}`);
    return haystack.includes(needle);
  });

  const disabledCount = rows.filter((r) => r.is_disabled).length;

  function handleToggleDisabled(row: MenuLimitRow, isDisabled: boolean) {
    startTransition(async () => {
      const result = await setBranchMenuDailyLimit({
        branchId,
        menuItemId: row.menu_item_id,
        limitQuantity: row.manual_limit_quantity,
        isDisabled,
      });

      if (!result.success) {
        toast.error(result.error ?? messages.pos.menu.saveLimitFailed);
        return;
      }

      setRows((prev) =>
        prev.map((item) =>
          item.menu_item_id === row.menu_item_id
            ? { ...item, is_disabled: isDisabled }
            : item,
        ),
      );

      toast.success(
        isDisabled
          ? `Đã ngưng bán món ${row.item_name}`
          : `Đã mở bán lại món ${row.item_name}`,
      );
      router.refresh();
    });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] overflow-hidden flex flex-col">
        <DrawerHeader className="shrink-0 border-b">
          <div className="flex items-center justify-between gap-2">
            <DrawerTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-5 text-warning" />
              Tạm ngưng bán món (1-Touch)
            </DrawerTitle>
            {disabledCount > 0 && (
              <Badge variant="destructive">
                Đang ngưng {disabledCount} món
              </Badge>
            )}
          </div>
          <DrawerDescription>
            Bật/tắt trạng thái hết hàng khẩn cấp. POS và KDS sẽ cập nhật ngay lập tức.
          </DrawerDescription>
          <div className="mt-2">
            <InputGroup className="w-full">
              <InputGroupAddon>
                <IconSearch className="size-4" />
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm tên món (sườn, chả, bì...)..."
              />
            </InputGroup>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner className="size-6 text-muted-foreground" />
            </div>
          ) : filteredRows.length === 0 ? (
            <AppEmptyState
              title={messages.pos.menu.noResults}
              compact
              symbol="roundPlate"
            />
          ) : (
            <ItemGroup className="gap-2">
              {filteredRows.map((row) => (
                <Item
                  key={row.menu_item_id}
                  variant="outline"
                  size="sm"
                  className="items-center justify-between bg-card"
                >
                  <ItemContent className="min-w-0">
                    <ItemTitle className="flex items-center gap-2 text-sm font-medium">
                      <span>{row.item_name}</span>
                      {row.is_disabled && (
                        <Badge variant="destructive" className="shrink-0">
                          Tạm ngưng
                        </Badge>
                      )}
                    </ItemTitle>
                    <ItemDescription className="flex items-center gap-2 text-xs">
                      <span className="font-mono tabular-nums text-foreground">
                        {formatVND(row.base_price)}
                      </span>
                      <span>•</span>
                      <span>{row.category_name}</span>
                    </ItemDescription>
                  </ItemContent>
                  <div className="flex shrink-0 items-center gap-3">
                    <Switch
                      size="touch"
                      checked={!row.is_disabled}
                      disabled={isPending}
                      onCheckedChange={(checked) =>
                        handleToggleDisabled(row, !checked)
                      }
                      aria-label={`Bật/Tắt bán món ${row.item_name}`}
                    />
                  </div>
                </Item>
              ))}
            </ItemGroup>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
