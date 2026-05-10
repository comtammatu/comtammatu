"use client";

import { useEffect, useState } from "react";
import {
  Monitor as IconDeviceDesktop,
  Moon as IconMoon,
  Sun as IconSun,
} from "lucide-react";
import { useTheme, type Theme } from "@comtammatu/ui/components/theme-provider";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
          {isDark ? <IconMoon /> : <IconSun />}
          <span className="sr-only">Chọn giao diện</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={current ?? "system"}
          onValueChange={(value) => setTheme(value as Theme)}
        >
          <DropdownMenuRadioItem value="light">
            <IconSun />
            Sáng
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <IconMoon />
            Tối
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <IconDeviceDesktop />
            Hệ thống
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
