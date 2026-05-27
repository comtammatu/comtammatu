"use client";

import { useEffect, useState } from "react";
import {
  Monitor as IconDeviceDesktop,
  Moon as IconMoon,
  Sun as IconSun,
} from "lucide-react";
import { useTheme } from "@comtammatu/ui/components/theme-provider";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";

export function InventoryThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = mounted ? theme : undefined;
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-sidebar-foreground/75 hover:text-sidebar-foreground"
          aria-label="Chọn giao diện"
          title="Giao diện"
        >
          {isDark ? (
            <IconMoon className="size-4" />
          ) : (
            <IconSun className="size-4" />
          )}
          <span className="sr-only">Chọn giao diện</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          data-active={current === "light"}
        >
          <IconSun className="mr-2 size-4" /> Sáng
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          data-active={current === "dark"}
        >
          <IconMoon className="mr-2 size-4" /> Tối
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          data-active={current === "system"}
        >
          <IconDeviceDesktop className="mr-2 size-4" /> Hệ thống
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
