package auth

// LoginRequest is the JSON body for POST /auth/login.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// MeResponse is the JSON body returned by GET /auth/me.
type MeResponse struct {
	TenantID int64   `json:"tenant_id"`
	BranchID *int64  `json:"branch_id"`
	UserRole string  `json:"user_role"`
	Position string  `json:"position"`
}
