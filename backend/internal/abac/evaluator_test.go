package abac

import (
	"testing"
)

func TestEvaluate(t *testing.T) {
	b1 := int64(1)
	b2 := int64(2)

	tests := []struct {
		name      string
		perms     []Permission
		key       string
		branchID  *int64
		wantAllow bool
	}{
		{
			name:      "allow when role default allows",
			perms:     []Permission{{Key: "menu:write", BranchID: nil, Effect: "allow"}},
			key:       "menu:write",
			branchID:  nil,
			wantAllow: true,
		},
		{
			name:      "deny when no permission exists",
			perms:     []Permission{},
			key:       "menu:write",
			branchID:  nil,
			wantAllow: false,
		},
		{
			name: "explicit deny beats allow",
			perms: []Permission{
				{Key: "pos:void_order", BranchID: nil, Effect: "allow"},
				{Key: "pos:void_order", BranchID: &b1, Effect: "deny"},
			},
			key:       "pos:void_order",
			branchID:  &b1,
			wantAllow: false,
		},
		{
			name:      "explicit allow override lifts default deny",
			perms:     []Permission{{Key: "finance:view", BranchID: nil, Effect: "allow"}},
			key:       "finance:view",
			branchID:  nil,
			wantAllow: true,
		},
		{
			name:      "branch-scoped allow does not apply to different branch",
			perms:     []Permission{{Key: "orders:void", BranchID: &b1, Effect: "allow"}},
			key:       "orders:void",
			branchID:  &b2,
			wantAllow: false,
		},
		{
			name:      "nil permission branch covers all branches",
			perms:     []Permission{{Key: "menu:read", BranchID: nil, Effect: "allow"}},
			key:       "menu:read",
			branchID:  &b1,
			wantAllow: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := evaluate(tc.perms, tc.key, tc.branchID)
			if got != tc.wantAllow {
				t.Errorf("evaluate() = %v, want %v", got, tc.wantAllow)
			}
		})
	}
}

func TestScopeMatches(t *testing.T) {
	b1 := int64(1)
	b2 := int64(2)

	if !scopeMatches(nil, nil) {
		t.Error("nil perm should match nil request")
	}
	if !scopeMatches(nil, &b1) {
		t.Error("nil perm should match any branch")
	}
	if scopeMatches(&b1, nil) {
		t.Error("scoped perm should not match nil request")
	}
	if !scopeMatches(&b1, &b1) {
		t.Error("same branch should match")
	}
	if scopeMatches(&b1, &b2) {
		t.Error("different branches should not match")
	}
}
