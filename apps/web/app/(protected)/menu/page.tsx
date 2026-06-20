/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: menu management page keeps tab labels inline */

import {
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { Badge } from "@comtammatu/ui/components/badge";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
import { UrlTabs } from "@/_components/url-tabs";
import { loadAuthState } from "@/_lib/auth";
import { CategoryTable } from "./category-table";
import { AddCategoryButton } from "./add-category-button";
import { ItemTable } from "./item-table";
import { AddItemButton } from "./add-item-button";
import { MenuImportExportMenu } from "./import-export-menu";

import { FORM_VI } from "@comtammatu/shared/messages";
export default async function MenuPage() {
  const { supabase, claims } = await loadAuthState();

  const [categoriesRes, itemsRes] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("id, name, type, sort_order, is_active")
      .order("sort_order")
      .order("name"),
    supabase
      .from("menu_items")
      .select(
        "id, name, description, base_price, category_id, image_url, is_active, sort_order, menu_categories(name, type)",
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
    image_url: item.image_url,
    is_active: item.is_active,
    sort_order: item.sort_order,
  }));

  return (
    <AppPage>
      <AppPageHeader
        eyebrow="Danh mục kinh doanh"
        title="Thực đơn"
        actions={<MenuImportExportMenu />}
      />

      <AppSection>
          <UrlTabs defaultValue="items">
            <TabsList className="h-11 rounded-lg bg-muted/60">
              <TabsTrigger value="items" className="px-3">
                Món ăn
                <Badge variant="secondary" className="ml-1.5 tabular-nums">
                  {items.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="categories" className="px-3">
                {FORM_VI.category}
                <Badge variant="secondary" className="ml-1.5 tabular-nums">
                  {categories.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="items" className="mt-6 flex flex-col gap-4">
              <div className="flex justify-end">
                <AddItemButton
                  categories={categories}
                  tenantId={claims.tenant_id}
                />
              </div>
              <div className="overflow-hidden rounded-lg border border-border/70">
                <ItemTable
                  items={items}
                  categories={categories}
                  tenantId={claims.tenant_id}
                />
              </div>
            </TabsContent>

            <TabsContent value="categories" className="mt-6 flex flex-col gap-4">
              <div className="flex justify-end">
                <AddCategoryButton />
              </div>
              <div className="overflow-hidden rounded-lg border border-border/70">
                <CategoryTable categories={categories} />
              </div>
            </TabsContent>
          </UrlTabs>
      </AppSection>
    </AppPage>
  );
}
