package menu

// MenuCategory represents a category row from the database.
type MenuCategory struct {
	ID        int64  `json:"id"`
	TenantID  int64  `json:"tenant_id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	SortOrder int    `json:"sort_order"`
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
}

// CreateMenuCategoryRequest is the JSON body for POST /categories.
type CreateMenuCategoryRequest struct {
	Name      string `json:"name"`
	Type      string `json:"type"`
	SortOrder int    `json:"sort_order"`
}

// UpdateMenuCategoryRequest is the JSON body for PUT /categories/{id}.
// All fields are optional (pointer = omitted means no change).
type UpdateMenuCategoryRequest struct {
	Name      *string `json:"name"`
	Type      *string `json:"type"`
	SortOrder *int    `json:"sort_order"`
	IsActive  *bool   `json:"is_active"`
}

// MenuItem represents an item row from the database.
type MenuItem struct {
	ID          int64  `json:"id"`
	TenantID    int64  `json:"tenant_id"`
	CategoryID  int64  `json:"category_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	BasePrice   string `json:"base_price"` // NUMERIC(15,2) → string to avoid float precision loss
	ImageURL    string `json:"image_url"`  // empty string when NULL
	IsActive    bool   `json:"is_active"`
	CreatedAt   string `json:"created_at"`
}

// CreateMenuItemRequest is the JSON body for POST /items.
type CreateMenuItemRequest struct {
	CategoryID  int64  `json:"category_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	BasePrice   string `json:"base_price"`
	ImageURL    string `json:"image_url"`
}

// UpdateMenuItemRequest is the JSON body for PUT /items/{id}.
// All fields are optional (pointer = omitted means no change).
type UpdateMenuItemRequest struct {
	Name        *string `json:"name"`
	CategoryID  *int64  `json:"category_id"`
	Description *string `json:"description"`
	BasePrice   *string `json:"base_price"`
	ImageURL    *string `json:"image_url"`
	IsActive    *bool   `json:"is_active"`
}

// DailyLimitRow mirrors a row from public.branch_menu_item_daily_limits, the
// per-branch / per-date table that the POS reads to disable sold-out items.
type DailyLimitRow struct {
	BranchID      int64  `json:"branch_id"`
	MenuItemID    int64  `json:"menu_item_id"`
	LimitDate     string `json:"limit_date"`
	LimitQuantity *int32 `json:"limit_quantity"`
	IsDisabled    bool   `json:"is_disabled"`
	SoldToday     int32  `json:"sold_today"`
}

// SetDailyLimitRequest is the JSON body for PUT /items/{id}/daily-limit.
// limit_quantity may be omitted/null to clear the quantity cap while keeping
// the row (so is_disabled stays effective).
type SetDailyLimitRequest struct {
	LimitQuantity *int32 `json:"limit_quantity"`
	IsDisabled    bool   `json:"is_disabled"`
}

// MenuItemVariant represents a variant row for a menu item.
type MenuItemVariant struct {
	ID         int64  `json:"id"`
	ItemID     int64  `json:"item_id"`
	Name       string `json:"name"`
	PriceDelta string `json:"price_delta"`
	IsActive   bool   `json:"is_active"`
}

// MenuItemModifier represents a modifier row for a menu item.
type MenuItemModifier struct {
	ID       int64  `json:"id"`
	ItemID   int64  `json:"item_id"`
	Name     string `json:"name"`
	Price    string `json:"price"`
	IsActive bool   `json:"is_active"`
}
