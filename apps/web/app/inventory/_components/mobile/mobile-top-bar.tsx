"use client";

import Link from "next/link";
import { LogOut as IconLogout, Warehouse as IconBuildingWarehouse } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";

interface MobileTopBarProps {
  siteName: string;
}

export function MobileTopBar({ siteName }: MobileTopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/95 px-3 backdrop-blur">
      <Link
        href="/inventory/m"
        className="flex items-center gap-2 font-semibold"
        aria-label="Về trang chủ kho"
      >
        <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <IconBuildingWarehouse className="size-5" />
        </span>
        <span className="text-sm leading-tight">
          <span className="block">Kho Má Tư</span>
          <span className="block text-xs font-normal text-muted-foreground">
            Mobile
          </span>
        </span>
      </Link>

      <span className="flex-1 truncate px-2 text-center text-xs font-medium text-muted-foreground">
        {siteName}
      </span>

      <form action="/api/auth/signout" method="post">
        <Button
          type="submit"
          variant="outline"
          size="icon-lg"
          className="size-10 rounded-lg text-muted-foreground"
          aria-label="Đăng xuất"
        >
          <IconLogout className="size-5" />
        </Button>
      </form>
    </header>
  );
}
