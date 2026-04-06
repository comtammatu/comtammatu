export type CategoryType = "main_dish" | "side_dish" | "drink" | "dessert";

export const SIDE_DISH_TYPE = "side_dish" as const;

// Validated at compile time via satisfies, but typed as Record<string, string>
// for runtime indexing with unknown string keys (e.g. from DB rows)
export const CATEGORY_TYPE_LABELS = {
  main_dish: "Món chính",
  side_dish: "Món phụ",
  drink: "Nước uống",
  dessert: "Tráng miệng",
} satisfies Record<CategoryType, string> as Record<string, string>;
