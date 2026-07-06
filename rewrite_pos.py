import re

with open("apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx", "r") as f:
    content = f.read()

# 1. Add Drawer and ItemGroup imports
content = content.replace('import { AppEmptyState, AppSection } from "@/components/surface";',
'''import { AppEmptyState, AppSection } from "@/components/surface";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@comtammatu/ui/components/drawer";''')

content = content.replace('ItemTitle,\n} from "@comtammatu/ui/components/item";',
'ItemTitle,\n  ItemGroup,\n} from "@comtammatu/ui/components/item";')


# 2. Orders list
# We find the AppSection for bills
old_orders_datatable = '''              <DataTable
                columns={orderColumns}
                data={orders}
                getRowKey={(order) => order.id}
                emptyTitle={messages.settings.posSessions.noBills}
                mobileBreakpoint={1024}
                onRowClick={(order) => setSelectedOrderId(order.id)}
                mobileCardRender={(order) => (
                  <Item variant="outline">
                    <ItemHeader>
                      <ItemContent>
                        <ItemTitle>{order.order_number}</ItemTitle>
                        <ItemDescription>
                          {formatTime(order.created_at)} ·{" "}
                          {order.order_type === "dine_in"
                            ? messages.settings.posSessions.tableContext(
                                order.tables?.number ?? "-",
                              )
                            : messages.settings.posSessions.takeaway}
                        </ItemDescription>
                      </ItemContent>
                      <IconChevronRight className="size-4 text-muted-foreground" />
                    </ItemHeader>
                    <ItemFooter>
                      <StatusBadge domain="order" value={order.status} />
                      <span className="font-mono text-sm font-semibold tabular-nums">
                        {formatVND(order.total_amount)}
                      </span>
                    </ItemFooter>
                  </Item>
                )}
              />'''

new_orders_list = '''              {orders.length > 0 ? (
                <ItemGroup>
                  {orders.map((order) => (
                    <Item
                      key={order.id}
                      variant="outline"
                      className="cursor-pointer"
                      onClick={() => setSelectedOrderId(order.id)}
                    >
                      <ItemHeader>
                        <ItemContent>
                          <ItemTitle>{order.order_number}</ItemTitle>
                          <ItemDescription>
                            {formatTime(order.created_at)} ·{" "}
                            {order.order_type === "dine_in"
                              ? messages.settings.posSessions.tableContext(
                                  order.tables?.number ?? "-",
                                )
                              : messages.settings.posSessions.takeaway}
                          </ItemDescription>
                        </ItemContent>
                        <IconChevronRight className="size-4 text-muted-foreground" />
                      </ItemHeader>
                      <ItemFooter>
                        <StatusBadge domain="order" value={order.status} />
                        <span className="font-mono text-sm font-semibold tabular-nums">
                          {formatVND(order.total_amount)}
                        </span>
                      </ItemFooter>
                    </Item>
                  ))}
                </ItemGroup>
              ) : (
                <AppEmptyState
                  title={messages.settings.posSessions.noBills}
                  compact
                />
              )}'''

content = content.replace(old_orders_datatable, new_orders_list)


# 3. Top items
old_top_items_datatable = '''          <DataTable
            columns={topItemColumns}
            data={top_items}
            getRowKey={(item) => `${item.source}-${item.name}`}
            mobileBreakpoint={1024}
            mobileCardRender={(item) => (
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle>{item.name}</ItemTitle>
                  <ItemDescription>
                    {ITEM_SOURCE_LABEL[item.source]} · {item.qty}
                  </ItemDescription>
                </ItemContent>
                <ItemFooter>
                  <Badge variant="outline">
                    {ITEM_SOURCE_LABEL[item.source]}
                  </Badge>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatVND(item.revenue)}
                  </span>
                </ItemFooter>
              </Item>
            )}
          />'''

new_top_items_list = '''          <ItemGroup>
            {top_items.map((item) => (
              <Item key={`${item.source}-${item.name}`} variant="outline">
                <ItemContent>
                  <ItemTitle>{item.name}</ItemTitle>
                  <ItemDescription>
                    {ITEM_SOURCE_LABEL[item.source]} · {item.qty}
                  </ItemDescription>
                </ItemContent>
                <ItemFooter>
                  <Badge variant="outline">
                    {ITEM_SOURCE_LABEL[item.source]}
                  </Badge>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatVND(item.revenue)}
                  </span>
                </ItemFooter>
              </Item>
            ))}
          </ItemGroup>'''

content = content.replace(old_top_items_datatable, new_top_items_list)


# 4. Discounts
old_discounts_datatable = '''          <DataTable
            columns={discountColumns}
            data={discounts.top_orders}
            getRowKey={(order) => order.order_id}
            mobileBreakpoint={1024}
            mobileCardRender={(order) => (
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle>{order.order_number}</ItemTitle>
                  <ItemDescription>{order.note ?? "—"}</ItemDescription>
                </ItemContent>
                <ItemFooter>
                  <Badge variant="outline">
                    {order.type === "pct"
                      ? `${order.value ?? 0}%`
                      : order.type === "vnd"
                        ? "VND"
                        : "—"}
                  </Badge>
                  <span className="font-mono text-sm font-semibold tabular-nums text-destructive">
                    -{formatVND(order.amount)}
                  </span>
                </ItemFooter>
              </Item>
            )}
          />'''

new_discounts_list = '''          <ItemGroup>
            {discounts.top_orders.map((order) => (
              <Item key={order.order_id} variant="outline">
                <ItemContent>
                  <ItemTitle>{order.order_number}</ItemTitle>
                  <ItemDescription>{order.note ?? "—"}</ItemDescription>
                </ItemContent>
                <ItemFooter>
                  <Badge variant="outline">
                    {order.type === "pct"
                      ? `${order.value ?? 0}%`
                      : order.type === "vnd"
                        ? "VND"
                        : "—"}
                  </Badge>
                  <span className="font-mono text-sm font-semibold tabular-nums text-destructive">
                    -{formatVND(order.amount)}
                  </span>
                </ItemFooter>
              </Item>
            ))}
          </ItemGroup>'''

content = content.replace(old_discounts_datatable, new_discounts_list)


# 5. Replace OrderDetailSheet with Drawer
content = content.replace('function OrderDetailSheet({', 'function OrderDetailDrawer({')
content = content.replace('<OrderDetailSheet', '<OrderDetailDrawer')

# Replace Sheet components with Drawer components in OrderDetailDrawer
sheet_to_drawer = {
    '<Sheet': '<Drawer',
    '</Sheet>': '</Drawer>',
    '<SheetContent': '<DrawerContent',
    '</SheetContent>': '</DrawerContent>',
    '<SheetHeader': '<DrawerHeader',
    '</SheetHeader>': '</DrawerHeader>',
    '<SheetTitle': '<DrawerTitle',
    '</SheetTitle>': '</DrawerTitle>',
    '<SheetDescription': '<DrawerDescription',
    '</SheetDescription>': '</DrawerDescription>'
}

# We only want to replace Sheet inside OrderDetailDrawer. Let's find the function body.
import re
drawer_func_pattern = re.compile(r'(function OrderDetailDrawer\(\{.*?)(?=function|$)', re.DOTALL)
match = drawer_func_pattern.search(content)
if match:
    drawer_body = match.group(1)
    for old, new in sheet_to_drawer.items():
        drawer_body = drawer_body.replace(old, new)
    # DrawerContent side="right" should just be removed, as well as w-full p-0 data-[side=right]:w-full
    drawer_body = re.sub(r'side="right"|className="w-full p-0 data-\[side=right\]:w-full"', '', drawer_body)
    # The scroll area inside Drawer shouldn't have max height 100vh manually if we use max-h-[90vh] DrawerContent
    # we can add className="max-h-[85vh] flex flex-col" to DrawerContent
    drawer_body = drawer_body.replace('<DrawerContent\n        \n        \n      >', '<DrawerContent className="max-h-[90vh] flex flex-col overflow-hidden">')
    
    content = content[:match.start()] + drawer_body + content[match.end():]

# Clean up any leftover columns arrays if they are not used anymore?
# The code will just be dead code but we can leave them or remove them.
# Removing columns:
content = re.sub(r'const orderColumns: DataTableColumn<PosSessionOrder>\[\] = \[.*?\];', '', content, flags=re.DOTALL)
content = re.sub(r'const topItemColumns: DataTableColumn.*?\];', '', content, flags=re.DOTALL)
content = re.sub(r'const discountColumns: DataTableColumn.*?\];', '', content, flags=re.DOTALL)

with open("apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx", "w") as f:
    f.write(content)

