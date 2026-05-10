package settings

// Branch represents a physical branch of a tenant.
type Branch struct {
	ID        int64  `json:"id"`
	TenantID  int64  `json:"tenant_id"`
	Name      string `json:"name"`
	Address   string `json:"address"`
	Phone     string `json:"phone"`
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
}

// CreateBranchRequest is the body for POST /branches.
type CreateBranchRequest struct {
	Name    string `json:"name"`
	Address string `json:"address"`
	Phone   string `json:"phone"`
}

// UpdateBranchRequest is the body for PUT /branches/{id}.
type UpdateBranchRequest struct {
	Name     *string `json:"name"`
	Address  *string `json:"address"`
	Phone    *string `json:"phone"`
	IsActive *bool   `json:"is_active"`
}

// Area represents a dining area within a tenant.
type Area struct {
	ID       int64  `json:"id"`
	TenantID int64  `json:"tenant_id"`
	Name     string `json:"name"`
}

// CreateAreaRequest is the body for POST /areas.
type CreateAreaRequest struct {
	Name string `json:"name"`
}
