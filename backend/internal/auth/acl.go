package auth

// ModuleKey mirrors ModuleKey from packages/shared/src/auth/module-acl.ts.
type ModuleKey string

const (
	ModuleDashboard          ModuleKey = "dashboard"
	ModuleMenu               ModuleKey = "menu"
	ModuleInventory          ModuleKey = "inventory"
	ModuleInventoryProcure   ModuleKey = "inventory_procurement"
	ModuleInventoryAdmin     ModuleKey = "inventory_admin" // retired surface — empty allowedRoles
	ModuleOrders             ModuleKey = "orders"
	ModuleStaff              ModuleKey = "staff"
	ModuleHR                 ModuleKey = "hr"
	ModuleCRM                ModuleKey = "crm"
	ModuleFinance            ModuleKey = "finance"
	ModuleAccounting         ModuleKey = "accounting"
	ModuleReports            ModuleKey = "reports"
	ModuleSettings           ModuleKey = "settings"
	ModulePOS                ModuleKey = "pos"
	ModuleKDS                ModuleKey = "kds"
	ModuleBranchSettings     ModuleKey = "branch_settings"
	ModuleBranchMenuLimits   ModuleKey = "branch_menu_limits"
	ModuleEmployee           ModuleKey = "employee"
	ModuleNotifications      ModuleKey = "notifications"
	ModuleFeedback           ModuleKey = "feedback"
)

type moduleACL struct {
	// PathPrefix is used for prefix-based route matching in middleware.
	PathPrefix   string
	AllowedRoles map[StaffRole]bool
}

// moduleACLMap is the single source of truth for route-level access control.
// Mirrors MODULE_ACL from packages/shared/src/auth/module-acl.ts exactly.
// When adding a module: update this map AND add the corresponding route in cmd/server/main.go.
var moduleACLMap = map[ModuleKey]moduleACL{
	ModuleDashboard: {
		PathPrefix:   "/admin/dashboard",
		AllowedRoles: rolesOf(RoleOwner, RoleSuperManager),
	},
	ModuleMenu: {
		PathPrefix:   "/menu",
		AllowedRoles: rolesOf(RoleOwner, RoleSuperManager, RoleAreaManager, RoleBranchManager),
	},
	ModuleInventory: {
		PathPrefix:   "/inventory",
		AllowedRoles: rolesOf(RoleOwner, RoleSuperManager, RoleAreaManager, RoleBranchManager, RoleWarehouseManager, RoleProductionManager),
	},
	ModuleInventoryProcure: {
		PathPrefix:   "/inventory/suppliers",
		AllowedRoles: rolesOf(RoleOwner, RoleSuperManager, RoleWarehouseManager, RoleProductionManager),
	},
	ModuleInventoryAdmin: {
		PathPrefix:   "/admin/inventory",
		AllowedRoles: rolesOf(), // retired — no access
	},
	ModuleOrders: {
		PathPrefix:   "/orders",
		AllowedRoles: rolesOf(RoleOwner, RoleSuperManager, RoleAreaManager, RoleBranchManager, RoleCashier),
	},
	ModuleStaff: {
		PathPrefix:   "/admin/staff",
		AllowedRoles: rolesOf(RoleOwner, RoleSuperManager),
	},
	ModuleHR: {
		PathPrefix:   "/hr",
		AllowedRoles: rolesOf(RoleOwner, RoleSuperManager),
	},
	ModuleCRM: {
		PathPrefix:   "/admin/crm",
		AllowedRoles: rolesOf(RoleOwner, RoleSuperManager),
	},
	ModuleFinance: {
		PathPrefix:   "/finance",
		AllowedRoles: rolesOf(RoleOwner, RoleSuperManager),
	},
	ModuleAccounting: {
		PathPrefix:   "/admin/accounting",
		AllowedRoles: rolesOf(RoleOwner, RoleSuperManager),
	},
	ModuleReports: {
		PathPrefix:   "/admin/reports",
		AllowedRoles: rolesOf(RoleOwner, RoleSuperManager),
	},
	ModuleSettings: {
		PathPrefix:   "/admin/settings",
		AllowedRoles: rolesOf(RoleOwner, RoleSuperManager, RoleAreaManager, RoleBranchManager),
	},
	ModulePOS: {
		PathPrefix:   "/br/*/pos",
		AllowedRoles: rolesOf(RoleCashier, RoleWaiter, RoleBranchManager),
	},
	ModuleKDS: {
		PathPrefix:   "/br/*/kds",
		AllowedRoles: rolesOf(RoleChef, RoleBranchManager),
	},
	ModuleBranchSettings: {
		PathPrefix:   "/br/*/settings",
		AllowedRoles: rolesOf(RoleOwner, RoleSuperManager, RoleAreaManager, RoleBranchManager),
	},
	ModuleBranchMenuLimits: {
		PathPrefix:   "/br/*/menu-limits",
		AllowedRoles: rolesOf(RoleOwner, RoleSuperManager, RoleAreaManager, RoleBranchManager, RoleCashier, RoleChef),
	},
	ModuleEmployee: {
		PathPrefix:   "/employee",
		AllowedRoles: allRolesMap(),
	},
	ModuleNotifications: {
		PathPrefix:   "/notifications",
		AllowedRoles: allRolesMap(),
	},
	ModuleFeedback: {
		PathPrefix:   "/admin/feedback",
		AllowedRoles: rolesOf(RoleOwner, RoleSuperManager, RoleAreaManager, RoleBranchManager),
	},
}

// CanAccess reports whether role is permitted to access module.
func CanAccess(role StaffRole, module ModuleKey) bool {
	acl, ok := moduleACLMap[module]
	if !ok {
		return false
	}
	return acl.AllowedRoles[role]
}

// rolesOf builds a set from the given roles for O(1) lookup.
func rolesOf(roles ...StaffRole) map[StaffRole]bool {
	m := make(map[StaffRole]bool, len(roles))
	for _, r := range roles {
		m[r] = true
	}
	return m
}

func allRolesMap() map[StaffRole]bool {
	return rolesOf(allRoles...)
}
