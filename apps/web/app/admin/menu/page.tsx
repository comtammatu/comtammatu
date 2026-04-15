import { createClient } from "@comtammatu/database/supabase/server";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import {
  PageContainer,
  PageHeader,
  SectionCard,
} from "@/components/foundation/ui-patterns";
import { CategoryTable } from "./category-table";
import { AddCategoryButton } from "./add-category-button";
import { ItemTable } from "./item-table";
import { AddItemButton } from "./add-item-button";

export default async function MenuPage() {
  const supabase = await createClient();

  const [categoriesRes, itemsRes] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("id, name, type, sort_order, is_active")
      .order("sort_order")
      .order("name"),
    supabase
      .from("menu_items")
      .select(
        "id, name, description, base_price, category_id, is_active, sort_order, menu_categories(name, type)",
      )
      .order("sort_order")
      .order("name"),
  ]);

  if (categoriesRes.error) throw new Error("Không thể tải danh mục");
  if (itemsRes.error) throw new Error("Không thể tải món ăn");

  const categories = categoriesRes.data;
  const items = itemsRes.data.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    base_price: item.base_price,
    category_id: item.category_id,
    category_name: item.menu_categories?.name ?? "—",
    category_type: item.menu_categories?.type ?? "main_dish",
    is_active: item.is_active,
    sort_order: item.sort_order,
  }));

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Danh mục kinh doanh"
        title="Thực đơn"
      />

      <SectionCard>
        <Tabs defaultValue="items">
          <TabsList className="h-11 rounded-2xl bg-muted/60">
          <TabsTrigger value="items" className="px-5">
            Món ăn
            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums">
              {items.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="categories" className="px-5">
            Danh mục
            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums">
              {categories.length}
            </span>
          </TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="mt-6 space-y-4">
            <div className="flex justify-end">
              <AddItemButton categories={categories} />
            </div>
            <div className="rounded-2xl border border-border/70 shadow-sm">
              <ItemTable items={items} categories={categories} />
            </div>
          </TabsContent>

          <TabsContent value="categories" className="mt-6 space-y-4">
            <div className="flex justify-end">
              <AddCategoryButton />
            </div>
            <div className="rounded-2xl border border-border/70 shadow-sm">
              <CategoryTable categories={categories} />
            </div>
          </TabsContent>
        </Tabs>
      </SectionCard>
    </PageContainer>
  );
}
