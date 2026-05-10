package staff

// StaffMember represents a tenant staff member.
type StaffMember struct {
	ID         string `json:"id"`          // uuid from auth.users
	TenantID   int64  `json:"tenant_id"`
	FullName   string `json:"full_name"`
	Email      string `json:"email"`
	UserRole   string `json:"user_role"`
	PositionID *int64 `json:"position_id"`
	BranchID   *int64 `json:"branch_id"`
	IsActive   bool   `json:"is_active"`
	CreatedAt  string `json:"created_at"`
}

// CreateStaffRequest is the body for POST /.
type CreateStaffRequest struct {
	FullName   string `json:"full_name"`
	Email      string `json:"email"`
	UserRole   string `json:"user_role"`
	PositionID *int64 `json:"position_id"`
	BranchID   *int64 `json:"branch_id"`
}

// UpdateStaffRequest is the body for PUT /{id}.
type UpdateStaffRequest struct {
	FullName   *string `json:"full_name"`
	UserRole   *string `json:"user_role"`
	PositionID *int64  `json:"position_id"`
	BranchID   *int64  `json:"branch_id"`
	IsActive   *bool   `json:"is_active"`
}

// StaffPermission represents a single permission grant for a staff member.
type StaffPermission struct {
	UserID        string  `json:"user_id"`
	BranchID      *int64  `json:"branch_id"`
	PermissionKey string  `json:"permission_key"`
	ValidFrom     string  `json:"valid_from"`
	ValidUntil    *string `json:"valid_until"`
}

// GrantPermissionRequest is the body for POST /{id}/permissions.
type GrantPermissionRequest struct {
	BranchID      *int64  `json:"branch_id"`
	PermissionKey string  `json:"permission_key"`
	ValidFrom     string  `json:"valid_from"`
	ValidUntil    *string `json:"valid_until"`
}
