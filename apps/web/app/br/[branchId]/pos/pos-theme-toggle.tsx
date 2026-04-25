"use client";

import { useEffect, useState } from "react";
import {
  Monitor as IconDeviceDesktop,
  Moon as IconMoon,
  Sun as IconSun,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { useTheme } from "@comtammatu/ui/components/theme-provider";

export function PosThemeToggle() {
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
          type="button"
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Chọn giao diện POS"
          title="Giao diện POS"
        >
          {isDark ? <IconMoon /> : <IconSun />}
          <span className="sr-only">Chọn giao diện POS</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          data-active={current === "light"}
        >
          <IconSun />
          Sáng
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          data-active={current === "dark"}
        >
          <IconMoon />
          Tối
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          data-active={current === "system"}
        >
          <IconDeviceDesktop />
          Hệ thống
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
