import { matchesSearch } from "@lib/search";

export type ItemFilterValues = {
  category: string;
  status: string;
  sort: string;
};

export type MenuItemForTableFilters = {
  name: string;
  category_name: string;
  category_id: number;
  is_active: boolean;
  base_price: number;
  sort_order: number;
};

export function filterAndSortItems<T extends MenuItemForTableFilters>(
  items: readonly T[],
  searchValue: string,
  filters: ItemFilterValues,
): T[] {
  const query = searchValue.trim();

  return items
    .filter(
      (item) =>
        (!query ||
          matchesSearch([item.name, item.category_name], query)) &&
        (filters.category === "all" ||
          item.category_id === Number(filters.category)) &&
        (filters.status === "all" ||
          item.is_active === (filters.status === "active")),
    )
    .toSorted((left, right) => {
      if (filters.sort === "name_asc") {
        return left.name.localeCompare(right.name, "vi");
      }
      if (filters.sort === "price_asc") {
        return left.base_price - right.base_price;
      }
      if (filters.sort === "price_desc") {
        return right.base_price - left.base_price;
      }
      return (
        left.sort_order - right.sort_order ||
        left.name.localeCompare(right.name, "vi")
      );
    });
}
