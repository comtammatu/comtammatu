package kds

// Ticket represents a KDS ticket row.
type Ticket struct {
	ID          int64   `json:"id"`
	TenantID    int64   `json:"tenant_id"`
	BranchID    int64   `json:"branch_id"`
	StationID   int64   `json:"station_id"`
	OrderID     int64   `json:"order_id"`
	OrderItemID int64   `json:"order_item_id"`
	Status      string  `json:"status"`
	BumpedAt    *string `json:"bumped_at,omitempty"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}
