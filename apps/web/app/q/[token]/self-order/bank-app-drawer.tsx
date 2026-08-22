"use client";

import { useMemo, useState } from "react";
import {
  ChevronRight as IconChevronRight,
  Landmark as IconBank,
  Search as IconSearch,
  X as IconClear,
} from "lucide-react";
import { ACTIONS_VI, SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { AppDrawer } from "@/components/surface/app-drawer";
import {
  STATIC_VIETQR_BANK_APPS,
  buildVietQrBankAppUrl,
  resolveBankAppPlatform,
  type VietQrBankApp,
} from "@lib/self-order/bank-app-link";

interface BankAppDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountNo: string;
  bankCode: string;
  amount: number;
  paymentCode: string;
  accountName?: string | null;
  qrData: string;
  onBankAppHandoff?: () => void;
}

export function BankLogoImage({
  src,
  alt,
}: {
  src: string | null;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted"
        aria-hidden="true"
      >
        <IconBank className="size-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      width={32}
      height={32}
      loading="lazy"
      decoding="async"
      className="size-8 shrink-0 rounded-md bg-white p-0.5 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function filterBankApps(
  apps: readonly VietQrBankApp[],
  query: string,
): VietQrBankApp[] {
  const q = normalizeSearch(query);
  if (!q) return apps.slice();

  return apps.filter((app) => {
    const nameNorm = normalizeSearch(app.name);
    const bankNameNorm = app.bankName ? normalizeSearch(app.bankName) : "";
    const shortNameNorm = app.shortName ? normalizeSearch(app.shortName) : "";
    const idNorm = app.id.toLowerCase();
    return (
      nameNorm.includes(q) ||
      bankNameNorm.includes(q) ||
      shortNameNorm.includes(q) ||
      idNorm.includes(q)
    );
  });
}

export function BankAppDrawer({
  open,
  onOpenChange,
  accountNo,
  bankCode,
  amount,
  paymentCode,
  accountName,
  qrData,
  onBankAppHandoff,
}: BankAppDrawerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const platform = resolveBankAppPlatform(
    typeof navigator !== "undefined" ? navigator : { userAgent: "" },
  );

  const filteredApps = useMemo(
    () => filterBankApps(STATIC_VIETQR_BANK_APPS, searchQuery),
    [searchQuery],
  );

  return (
    <AppDrawer
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setSearchQuery("");
      }}
      title={SELF_ORDER_VI.chooseBankAppTitle}
      description={SELF_ORDER_VI.chooseBankAppDescription}
      contentClassName="max-h-dvh-80"
      bodyClassName="flex min-h-0 flex-col gap-3 p-0"
    >
      <div className="shrink-0 px-3 pt-1">
        <InputGroup className="w-full">
          <InputGroupAddon>
            <IconSearch className="size-4 text-muted-foreground" aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={SELF_ORDER_VI.searchBankPlaceholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {searchQuery ? (
            <InputGroupAddon align="inline-end">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery("")}
              >
                <IconClear className="size-4" />
                <span className="sr-only">{ACTIONS_VI.clearFilter}</span>
              </Button>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-hidden overscroll-contain px-3 pb-3">
        {filteredApps.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            {SELF_ORDER_VI.bankSearchEmpty}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {filteredApps.map((app) => {
              const href = buildVietQrBankAppUrl({
                appId: app.id,
                accountNo,
                bankCode,
                amount,
                paymentCode,
                accountName,
                qrData,
                platform,
              });
              if (!href) return null;

              return (
                <Button
                  key={app.id}
                  variant="ghost"
                  size="touch"
                  className="flex h-auto w-full items-center justify-between gap-3 px-2 py-2 text-left"
                  render={<a href={href} />}
                  onClick={() => {
                    onBankAppHandoff?.();
                    onOpenChange(false);
                  }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <BankLogoImage src={app.logoUrl} alt={app.name} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium leading-tight text-foreground">
                        {app.name}
                      </span>
                      {app.bankName ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {app.bankName}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </AppDrawer>
  );
}
