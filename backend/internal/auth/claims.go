package auth

// StaffRole mirrors packages/shared/src/auth/types.ts STAFF_ROLES.
type StaffRole string

const (
	RoleOwner             StaffRole = "owner"
	RoleSuperManager      StaffRole = "super_manager"
	RoleAreaManager       StaffRole = "area_manager"
	RoleBranchManager     StaffRole = "branch_manager"
	RoleWarehouseManager  StaffRole = "warehouse_manager"
	RoleProductionManager StaffRole = "production_manager"
	RoleCashier           StaffRole = "cashier"
	RoleWaiter            StaffRole = "waiter"
	RoleChef              StaffRole = "chef"
	RoleOffice            StaffRole = "office"
)

// allRoles is used by module ACL entries that allow every role (e.g. employee, notifications).
var allRoles = []StaffRole{
	RoleOwner, RoleSuperManager, RoleAreaManager, RoleBranchManager,
	RoleWarehouseManager, RoleProductionManager, RoleCashier, RoleWaiter,
	RoleChef, RoleOffice,
}

// TenantLevelRoles do not require branch scope — they operate across the tenant.
var TenantLevelRoles = map[StaffRole]bool{
	RoleOwner:        true,
	RoleSuperManager: true,
	RoleAreaManager:  true,
	RoleOffice:       true,
}

// Claims mirrors JwtClaims from packages/shared/src/auth/types.ts.
// These are the custom claims injected by custom_access_token_hook().
type Claims struct {
	UserID   int64     `json:"user_id"`
	TenantID int64     `json:"tenant_id"`
	BranchID *int64    `json:"branch_id"` // null for tenant-level roles
	AreaID   *int64    `json:"area_id"`
	UserRole StaffRole `json:"user_role"`
	Position string    `json:"position,omitempty"` // HR position code (dual-emitted alongside user_role)
}
