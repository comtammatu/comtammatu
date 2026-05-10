package auth

import "testing"

func TestCanAccess(t *testing.T) {
	tests := []struct {
		name   string
		role   StaffRole
		module ModuleKey
		want   bool
	}{
		{"owner+dashboard", RoleOwner, ModuleDashboard, true},
		{"cashier+dashboard", RoleCashier, ModuleDashboard, false},
		{"owner+employee", RoleOwner, ModuleEmployee, true},
		{"cashier+employee", RoleCashier, ModuleEmployee, true},
		{"chef+kds", RoleChef, ModuleKDS, true},
		{"waiter+kds", RoleWaiter, ModuleKDS, false},
		{"unknown module", RoleOwner, ModuleKey("nonexistent"), false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := CanAccess(tc.role, tc.module)
			if got != tc.want {
				t.Errorf("CanAccess(%q, %q) = %v, want %v", tc.role, tc.module, got, tc.want)
			}
		})
	}
}
