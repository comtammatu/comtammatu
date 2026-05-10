package menu

// MenuCategory represents a category row from the database.
type MenuCategory struct {
	ID        int64  `json:"id"`
	TenantID  int64  `json:"tenant_id"`
	Name      string `json:"name"`
	SortOrder int    `json:"sort_order"`
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
}

// CreateMenuCategoryRequest is the JSON body for POST /categories.
type CreateMenuCategoryRequest struct {
	Name      string `json:"name"`
	SortOrder int    `json:"sort_order"`
}

// MenuItem represents an item row from the database.
type MenuItem struct {
	ID          int64  `json:"id"`
	TenantID    int64  `json:"tenant_id"`
	CategoryID  int64  `json:"category_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	BasePrice   string `json:"base_price"` // NUMERIC(15,2) → string to avoid float precision loss
	IsActive    bool   `json:"is_active"`
	CreatedAt   string `json:"created_at"`
}

// CreateMenuItemRequest is the JSON body for POST /items.
type CreateMenuItemRequest struct {
	CategoryID  int64  `json:"category_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	BasePrice   string `json:"base_price"`
}

// UpdateMenuItemRequest is the JSON body for PUT /items/{id}.
// All fields are optional (pointer = omitted means no change).
type UpdateMenuItemRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	BasePrice   *string `json:"base_price"`
	IsActive    *bool   `json:"is_active"`
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
