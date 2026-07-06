import re

with open("apps/web/app/(protected)/inventory/transfers/transfers-list-client.tsx", "r") as f:
    content = f.read()

# Add Drawer and useLongPress imports
content = content.replace('import { ItemGroup } from "@comtammatu/ui/components/item";',
'''import { ItemGroup } from "@comtammatu/ui/components/item";
import { useLongPress } from "@lib/hooks/use-long-press";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@comtammatu/ui/components/drawer";''')

# Inject drawerRow state into TransfersListClient
state_injection = '''  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TransferTab>(initialTab);
  const [drawerRow, setDrawerRow] = useState<TransferListRow | null>(null);
  const router = useRouter();'''

# We also need to import useRouter
content = content.replace('import { useRouter } from "next/navigation";', '') # prevent duplicate if any
content = content.replace('import Link from "next/link";', 'import Link from "next/link";\nimport { useRouter } from "next/navigation";')

content = content.replace('''  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TransferTab>(initialTab);''', state_injection)

# Add Drawer JSX in TransfersListClient
drawer_markup = '''
      <Drawer open={!!drawerRow} onOpenChange={(open) => !open && setDrawerRow(null)}>
        <DrawerContent>
          {drawerRow && (
            <>
              <DrawerHeader>
                <DrawerTitle>{drawerRow.transfer_number}</DrawerTitle>
                <DrawerDescription>{drawerRow.from_branch_name} → {drawerRow.to_branch_name}</DrawerDescription>
              </DrawerHeader>
              <div className="p-4 flex flex-col gap-3">
                <Button variant="default" className="w-full" onClick={() => router.push(detailHref(drawerRow.id))}>
                  Xem chi tiết
                </Button>
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
'''

# Find the end of TransfersListClient component
# The component ends with:
#   return (
#     <AppPage width="xwide" density="compact">
#       <AppPageHeader
#         eyebrow={messages.inventory.shell.moduleName}
#         title={pageTitle}
#         actions={desktopCreateAction}
#       />
#       {desktopToolbar}
#       {desktopTable}
#     </AppPage>
#   );
# }

content = content.replace('    </AppPage>\n  );\n}', drawer_markup + '    </AppPage>\n  );\n}')

# Wait, embedded return path:
content = content.replace('      </div>\n    );\n  }\n\n  return (', drawer_markup + '      </div>\n    );\n  }\n\n  return (')

# Operator return path:
content = content.replace('          </ItemGroup>\n        )}\n      </div>\n    );\n  }', '          </ItemGroup>\n        )}\n' + drawer_markup + '      </div>\n    );\n  }')


# Modify mobileCardRender calls to pass onOpenDrawer
content = content.replace('<MobileTransferCard row={r} tab={activeTab} href={detailHref(r.id)} />',
'<MobileTransferCard row={r} tab={activeTab} href={detailHref(r.id)} onOpenDrawer={setDrawerRow} />')

content = content.replace('''                <MobileTransferCard
                  key={r.id}
                  row={r}
                  tab={activeTab}
                  href={detailHref(r.id)}
                />''',
'''                <MobileTransferCard
                  key={r.id}
                  row={r}
                  tab={activeTab}
                  href={detailHref(r.id)}
                  onOpenDrawer={setDrawerRow}
                />''')

# Rewrite MobileTransferCard
old_card = '''function MobileTransferCard({
  row,
  tab,
  href,
}: {
  row: TransferListRow;
  tab: TransferTab;
  href: string;
}) {
  const Icon =
    tab === "receive"
      ? IconPackageImport
      : tab === "dispatch"
        ? IconSend
        : IconCircleCheck;

  return (
    <InteractiveCard asChild minHeight="mobile" className="h-auto">
      <Link href={href}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-mono text-sm font-semibold">
              {row.transfer_number}
            </p>
            <StatusBadge domain="inventory" value={row.status} size="sm" />
          </div>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <span className="truncate">{row.from_branch_name}</span>
            <IconArrowRight className="size-3 shrink-0" />
            <span className="truncate">{row.to_branch_name}</span>
          </p>
          {(row.shipped_at || row.created_at) && (
            <p className="text-xs text-muted-foreground">
              {formatVNDate(row.shipped_at ?? row.created_at)}
            </p>
          )}
        </div>
        <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </InteractiveCard>
  );
}'''

new_card = '''function MobileTransferCard({
  row,
  tab,
  href,
  onOpenDrawer,
}: {
  row: TransferListRow;
  tab: TransferTab;
  href: string;
  onOpenDrawer: (row: TransferListRow) => void;
}) {
  const router = useRouter();
  const Icon =
    tab === "receive"
      ? IconPackageImport
      : tab === "dispatch"
        ? IconSend
        : IconCircleCheck;

  const longPress = useLongPress({
    onLongPress: () => onOpenDrawer(row),
    onClick: () => router.push(href),
  });

  return (
    <InteractiveCard asChild minHeight="mobile" className="h-auto">
      <div
        {...longPress}
        className="flex flex-row items-center gap-3 touch-none select-none cursor-pointer active:scale-[0.98] transition-transform"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary pointer-events-none">
          <Icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1 pointer-events-none">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-mono text-sm font-semibold">
              {row.transfer_number}
            </p>
            <StatusBadge domain="inventory" value={row.status} size="sm" />
          </div>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <span className="truncate">{row.from_branch_name}</span>
            <IconArrowRight className="size-3 shrink-0" />
            <span className="truncate">{row.to_branch_name}</span>
          </p>
          {(row.shipped_at || row.created_at) && (
            <p className="text-xs text-muted-foreground">
              {formatVNDate(row.shipped_at ?? row.created_at)}
            </p>
          )}
        </div>
        <IconChevronRight className="size-4 shrink-0 text-muted-foreground pointer-events-none" />
      </div>
    </InteractiveCard>
  );
}'''

content = content.replace(old_card, new_card)

with open("apps/web/app/(protected)/inventory/transfers/transfers-list-client.tsx", "w") as f:
    f.write(content)

