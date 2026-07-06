import re

with open("apps/web/app/(protected)/inventory/stocktake/stocktake-list-client.tsx", "r") as f:
    content = f.read()

# Add useLongPress, Drawer, etc. imports
content = content.replace('import { Button } from "@comtammatu/ui/components/button";',
'''import { Button } from "@comtammatu/ui/components/button";
import { useLongPress } from "@lib/hooks/use-long-press";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@comtammatu/ui/components/drawer";
import { cancelStocktake } from "../actions";
import { useTransition } from "react";
import { toast } from "@comtammatu/ui/components/sonner";
import { IconBan } from "lucide-react";''')

content = content.replace('import { createStocktakeSession } from "../actions";',
'import { createStocktakeSession } from "../actions";\nimport { Ban as IconBan } from "lucide-react";')


# Rewrite StocktakeSessionCard to use long press and not just be a link
old_card = '''function StocktakeSessionCard({
  row,
  routeBase,
}: {
  row: StocktakeSessionRow;
  routeBase: string;
}) {
  return (
    <InteractiveCard minHeight="mobile" padding="default" asChild>
      <Link
        href={`${routeBase}/${row.id}?branchId=${row.branch_id}`}
        className="flex-col items-stretch gap-3"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-medium">KK-{row.id}</span>
          <StatusBadge domain="inventory" value={row.status} />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{row.branches?.name ?? "—"}</span>
          <span className="tabular-nums">
            {formatDateShort(row.started_at ?? row.created_at)}
          </span>
        </div>
      </Link>
    </InteractiveCard>
  );
}'''

new_card = '''function StocktakeSessionCard({
  row,
  routeBase,
  onOpenDrawer,
}: {
  row: StocktakeSessionRow;
  routeBase: string;
  onOpenDrawer: (row: StocktakeSessionRow) => void;
}) {
  const router = useRouter();
  
  const longPress = useLongPress({
    onLongPress: () => onOpenDrawer(row),
    onClick: () => router.push(`${routeBase}/${row.id}?branchId=${row.branch_id}`),
  });

  return (
    <div
      {...longPress}
      className="flex flex-col items-stretch gap-3 p-4 rounded-xl border bg-card text-card-foreground shadow-sm touch-none select-none cursor-pointer active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center justify-between gap-2 pointer-events-none">
        <span className="font-mono text-sm font-medium">KK-{row.id}</span>
        <StatusBadge domain="inventory" value={row.status} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground pointer-events-none">
        <span>{row.branches?.name ?? "—"}</span>
        <span className="tabular-nums">
          {formatDateShort(row.started_at ?? row.created_at)}
        </span>
      </div>
    </div>
  );
}'''

content = content.replace(old_card, new_card)

# Inject drawer state in StocktakeListClient
state_injection = '''  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const branchQuery = userBranchId != null ? `?branchId=${userBranchId}` : "";
  const [drawerRow, setDrawerRow] = useState<StocktakeSessionRow | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCancelSession(id: number) {
    if (!confirm(messages.inventory.stocktake.cancelConfirm)) return;
    startTransition(async () => {
      const res = await cancelStocktake(id);
      if (!res.success) {
        toast.error(res.error ?? messages.inventory.stocktake.cancelFailed);
        return;
      }
      toast.success(messages.inventory.stocktake.cancelOk);
      setDrawerRow(null);
      router.refresh();
    });
  }'''

content = re.sub(r'  const \[search.*?branchQuery.*?;', state_injection, content, flags=re.DOTALL)

# Modify mobileCardRender to pass onOpenDrawer
content = content.replace('mobileCardRender={(r) => (\n          <StocktakeSessionCard row={r} routeBase={routeBase} />\n        )}',
'mobileCardRender={(r) => (\n          <StocktakeSessionCard row={r} routeBase={routeBase} onOpenDrawer={setDrawerRow} />\n        )}')

# Add Drawer to the bottom of StocktakeListClient
drawer_markup = '''      <Drawer open={!!drawerRow} onOpenChange={(open) => !open && setDrawerRow(null)}>
        <DrawerContent>
          {drawerRow && (
            <>
              <DrawerHeader>
                <DrawerTitle>KK-{drawerRow.id}</DrawerTitle>
                <DrawerDescription>{drawerRow.branches?.name ?? "—"}</DrawerDescription>
              </DrawerHeader>
              <div className="p-4 flex flex-col gap-3">
                <Button variant="default" className="w-full" onClick={() => router.push(`${routeBase}/${drawerRow.id}?branchId=${drawerRow.branch_id}`)}>
                  {messages.inventory.stocktake.detailsAction || "Xem chi tiết"}
                </Button>
                {drawerRow.status === "in_progress" && (
                  <Button variant="destructive" className="w-full" disabled={isPending} onClick={() => handleCancelSession(drawerRow.id)}>
                    <IconBan className="mr-2 h-4 w-4" />
                    {messages.inventory.stocktake.cancelAction || "Hủy phiếu"}
                  </Button>
                )}
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );'''

content = content.replace('    </>\n  );', drawer_markup)

with open("apps/web/app/(protected)/inventory/stocktake/stocktake-list-client.tsx", "w") as f:
    f.write(content)

