package notifications

// Notification represents a row from the notifications table with read state.
type Notification struct {
	ID         int64   `json:"id"`
	TenantID   int64   `json:"tenant_id"`
	Kind       string  `json:"kind"`
	Severity   string  `json:"severity"`
	Title      string  `json:"title"`
	Body       *string `json:"body,omitempty"`
	EntityType *string `json:"entity_type,omitempty"`
	EntityID   *int64  `json:"entity_id,omitempty"`
	ActionURL  *string `json:"action_url,omitempty"`
	IsRead     bool    `json:"is_read"`
	CreatedAt  string  `json:"created_at"`
}
