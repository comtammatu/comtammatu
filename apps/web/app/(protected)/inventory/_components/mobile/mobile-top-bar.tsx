"use client";

import Link from "next/link";
import { LogOut as IconLogout } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { BrandMark } from "@/components/brand";
import { messages } from "@lib/messages";

interface MobileTopBarProps {
  siteName: string;
}

export function MobileTopBar({ siteName }: MobileTopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/95 px-3 backdrop-blur">
      <Link
        href="/inventory"
        className="flex items-center gap-2 font-semibold"
        aria-label={messages.inventory.shell.mobileHomeAria}
      >
        <span className="inline-flex size-8 items-center justify-center rounded-md border bg-background p-1">
          <BrandMark decorative className="size-full" />
        </span>
        <span className="text-sm leading-tight">
          <span className="block">{messages.inventory.shell.mobileBrand}</span>
          <span className="block text-xs font-normal text-muted-foreground">
            {messages.inventory.shell.mobileMode}
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
          className="size-10 rounded-md text-muted-foreground"
          aria-label={messages.inventory.common.signOut}
        >
          <IconLogout className="size-5" />
        </Button>
      </form>
    </header>
  );
}
