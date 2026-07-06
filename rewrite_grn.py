import re

with open("apps/web/app/(protected)/inventory/grn/grn-list-client.tsx", "r") as f:
    content = f.read()

# Add useLongPress, Drawer imports
content = content.replace('import { toast } from "@comtammatu/ui/components/sonner";',
'''import { toast } from "@comtammatu/ui/components/sonner";
import { useLongPress } from "@lib/hooks/use-long-press";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@comtammatu/ui/components/drawer";''')

# Rewrite GrnMobileCard
old_card = '''function GrnMobileCard({ grn, basePath }: { grn: GrnRow; basePath: string }) {
  return (
    <InteractiveCard asChild minHeight="mobile" padding="default">
      <Link href={grnDetailHref(basePath, grn.id)} className="block">
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{grn.code}</span>
            <StatusBadge domain="inventory" value={grn.status} size="sm" />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {grn.supplierName}
            {` • ${grn.branchName}`}
            {grn.poCode && ` • PO ${grn.poCode}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">
            {grn.date || "—"}
          </span>
          <span className="font-mono text-sm font-semibold">
            {formatVND(grn.total)}
          </span>
        </div>
      </Link>
    </InteractiveCard>
  );
}'''

new_card = '''function GrnMobileCard({
  grn,
  basePath,
  onOpenDrawer,
}: {
  grn: GrnRow;
  basePath: string;
  onOpenDrawer: (grn: GrnRow) => void;
}) {
  const router = useRouter();

  const longPress = useLongPress({
    onLongPress: () => onOpenDrawer(grn),
    onClick: () => router.push(grnDetailHref(basePath, grn.id)),
  });

  return (
    <div
      {...longPress}
      className="flex flex-row items-center justify-between gap-3 p-4 rounded-xl border bg-card text-card-foreground shadow-sm touch-none select-none cursor-pointer active:scale-[0.98] transition-transform"
    >
      <div className="min-w-0 flex-1 flex flex-col gap-1 pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold">{grn.code}</span>
          <StatusBadge domain="inventory" value={grn.status} size="sm" />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {grn.supplierName}
          {` • ${grn.branchName}`}
          {grn.poCode && ` • PO ${grn.poCode}`}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 pointer-events-none">
        <span className="text-xs text-muted-foreground">
          {grn.date || "—"}
        </span>
        <span className="font-mono text-sm font-semibold">
          {formatVND(grn.total)}
        </span>
      </div>
    </div>
  );
}'''

content = content.replace(old_card, new_card)

# Inject drawer state in GrnListClient
state_injection = '''  const isOperator = basePath.startsWith("/br/");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [drawerRow, setDrawerRow] = useState<GrnRow | null>(null);
  const router = useRouter();'''

content = content.replace('''  const isOperator = basePath.startsWith("/br/");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");''', state_injection)

# Modify mobileCardRender to pass onOpenDrawer
content = content.replace('mobileCardRender={(g) => <GrnMobileCard grn={g} basePath={basePath} />}',
'mobileCardRender={(g) => <GrnMobileCard grn={g} basePath={basePath} onOpenDrawer={setDrawerRow} />}')

# Add Drawer to the bottom of GrnListClient (before the final closing tag depending on if embedded or not, wait, it returns multiple places)
# Actually, the component returns:
# if (isOperator) { return ( <div ...> ... {listBody} </div> ); }
# if (embedded) { return ( <div ...> {desktopActions} {officeBody} </div> ); }
# return ( <AppPage> ... {officeBody} </AppPage> );

drawer_markup = '''
      <Drawer open={!!drawerRow} onOpenChange={(open) => !open && setDrawerRow(null)}>
        <DrawerContent>
          {drawerRow && (
            <>
              <DrawerHeader>
                <DrawerTitle>{drawerRow.code}</DrawerTitle>
                <DrawerDescription>{drawerRow.supplierName} • {drawerRow.branchName}</DrawerDescription>
              </DrawerHeader>
              <div className="p-4 flex flex-col gap-3">
                <Button variant="default" className="w-full" onClick={() => router.push(grnDetailHref(basePath, drawerRow.id))}>
                  Xem chi tiết
                </Button>
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
'''

# Best way is to append it inside listBody, since listBody is used in all 3 return paths.
listbody_search = 'mobileCardRender={(g) => <GrnMobileCard grn={g} basePath={basePath} onOpenDrawer={setDrawerRow} />}\n      />\n    </>'
listbody_replace = 'mobileCardRender={(g) => <GrnMobileCard grn={g} basePath={basePath} onOpenDrawer={setDrawerRow} />}\n      />\n' + drawer_markup + '\n    </>'

content = content.replace(listbody_search, listbody_replace)

with open("apps/web/app/(protected)/inventory/grn/grn-list-client.tsx", "w") as f:
    f.write(content)

