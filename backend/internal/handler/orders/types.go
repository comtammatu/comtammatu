package orders

// Order represents a restaurant order.
type Order struct {
	ID            int64       `json:"id"`
	TenantID      int64       `json:"tenant_id"`
	BranchID      int64       `json:"branch_id"`
	TableID       *int64      `json:"table_id,omitempty"`
	OrderNumber   string      `json:"order_number"`
	OrderType     string      `json:"order_type"`
	Status        string      `json:"status"`
	Subtotal      string      `json:"subtotal"`
	TotalAmount   string      `json:"total_amount"`
	PaymentMethod *string     `json:"payment_method,omitempty"`
	PaymentStatus string      `json:"payment_status"`
	CustomerCount int         `json:"customer_count"`
	Note          *string     `json:"note,omitempty"`
	CreatedBy     int64       `json:"created_by"`
	CreatedAt     string      `json:"created_at"`
	Items         []OrderItem `json:"items,omitempty"`
}

// OrderItem represents a line item within an order.
type OrderItem struct {
	ID          int64   `json:"id"`
	OrderID     int64   `json:"order_id"`
	MenuItemID  int64   `json:"menu_item_id"`
	VariantID   *int64  `json:"variant_id,omitempty"`
	ItemName    string  `json:"item_name"`
	VariantName *string `json:"variant_name,omitempty"`
	Quantity    int     `json:"quantity"`
	UnitPrice   string  `json:"unit_price"`
	Subtotal    string  `json:"subtotal"`
	Note        *string `json:"note,omitempty"`
	Status      string  `json:"status"`
}

// CreateOrderRequest is the body for POST /orders.
type CreateOrderRequest struct {
	TableID       *int64            `json:"table_id"`
	PosSessionID  *int64            `json:"pos_session_id"`
	OrderType     string            `json:"order_type"` // dine_in | takeaway
	CustomerCount int               `json:"customer_count"`
	Note          *string           `json:"note"`
	Items         []CreateItemInput `json:"items"`
}

// CreateItemInput is one line item in a create/append request.
type CreateItemInput struct {
	MenuItemID  int64   `json:"menu_item_id"`
	VariantID   *int64  `json:"variant_id"`
	ItemName    string  `json:"item_name"`
	VariantName *string `json:"variant_name"`
	Quantity    int     `json:"quantity"`
	UnitPrice   string  `json:"unit_price"`
	Subtotal    string  `json:"subtotal"`
	Note        *string `json:"note"`
}

// AppendItemsRequest is the body for POST /orders/{id}/items.
type AppendItemsRequest struct {
	Items []CreateItemInput `json:"items"`
}

// PaymentRequest is the body for POST /orders/{id}/payment.
type PaymentRequest struct {
	Method string `json:"method"` // cash | vietqr | momo
	Amount string `json:"amount"`
}

// CloseShiftRequest is the body for POST /br/{branchId}/shifts/close.
type CloseShiftRequest struct {
	SessionID   int64   `json:"session_id"`
	ClosingCash string  `json:"closing_cash"`
	Note        *string `json:"note"`
}
