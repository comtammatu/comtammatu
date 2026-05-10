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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { useTheme, type Theme } from "@comtammatu/ui/components/theme-provider";

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
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Chọn giao diện POS"
          title="Giao diện POS"
        >
          {isDark ? <IconMoon /> : <IconSun />}
          <span className="sr-only">Chọn giao diện POS</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" density="touch">
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
