"use client";

import type { ComponentProps } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@comtammatu/ui/components/theme-provider";
import { Button } from "@comtammatu/ui/components/button";
import { DropdownMenuItem } from "@comtammatu/ui/components/dropdown-menu";
import { messages } from "@lib/messages";

type ThemeToggleProps = Pick<
  ComponentProps<typeof Button>,
  "className" | "size" | "variant"
>;

export function ThemeToggle({
  className,
  size = "icon",
  variant = "ghost",
}: ThemeToggleProps = {}) {
  const { theme, toggleTheme } = useTheme();
  const isNight = theme === "night";
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      aria-label={
        isNight
          ? messages.common.themeToggleToLight
          : messages.common.themeToggleToNight
      }
      aria-pressed={isNight}
      onClick={toggleTheme}
    >
      {isNight ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

export function ThemeMenuItem() {
  const { theme, toggleTheme } = useTheme();
  const isNight = theme === "night";
  return (
    <DropdownMenuItem onClick={toggleTheme}>
      {isNight ? <Sun /> : <Moon />}
      {isNight
        ? messages.common.themeToggleToLight
        : messages.common.themeToggleToNight}
    </DropdownMenuItem>
  );
}
