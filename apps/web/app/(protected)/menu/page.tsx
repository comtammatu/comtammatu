import {
  AppPage,
  AppPageHeader,
  AppSection,
  AppEmptyState,
} from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { loadAuthState } from "@/_lib/auth";
import { CategoryTable } from "./category-table";
import { AddCategoryButton } from "./add-category-button";
import { ItemTable } from "./item-table";
import { AddItemButton } from "./add-item-button";
import { MenuImportExportMenu } from "./import-export-menu";

import { FORM_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { MENU_VI } from "./menu-copy";

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

  if (categoriesRes.error) {
    return (
      <AppPage width="wide">
        <AppPageHeader eyebrow={MENU_VI.eyebrow} title={MENU_VI.title} />
        <AppEmptyState mode="error" description={ERRORS_VI.loadFailed} />
      </AppPage>
    );
  }
  if (itemsRes.error) {
    return (
      <AppPage width="wide">
        <AppPageHeader eyebrow={MENU_VI.eyebrow} title={MENU_VI.title} />
        <AppEmptyState mode="error" description={MENU_VI.loadItemsFailed} />
      </AppPage>
    );
  }

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
    <AppPage width="wide">
      <AppPageHeader
        eyebrow={MENU_VI.eyebrow}
        title={MENU_VI.title}
        actions={<MenuImportExportMenu />}
        tabs={
          <AppPageTabs
            defaultValue="items"
            items={[
              { value: "items", label: MENU_VI.itemsTab, count: items.length },
              {
                value: "categories",
                label: FORM_VI.category,
                count: categories.length,
              },
            ]}
          >
            <TabsContent value="items" className="flex flex-col gap-4">
              <AppSection
                contentFlush
                action={
                  <AddItemButton
                    categories={categories}
                    tenantId={claims.tenant_id}
                  />
                }
              >
                <ItemTable
                  items={items}
                  categories={categories}
                  tenantId={claims.tenant_id}
                />
              </AppSection>
            </TabsContent>

            <TabsContent value="categories" className="flex flex-col gap-4">
              <AppSection contentFlush action={<AddCategoryButton />}>
                <CategoryTable categories={categories} />
              </AppSection>
            </TabsContent>
          </AppPageTabs>
        }
      />
    </AppPage>
  );
}
