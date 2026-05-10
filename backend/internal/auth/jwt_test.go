package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// testClaims mirrors supabaseClaims for token generation in tests.
type testClaims struct {
	jwt.RegisteredClaims
	TenantID int64     `json:"tenant_id"`
	BranchID *int64    `json:"branch_id"`
	AreaID   *int64    `json:"area_id"`
	UserRole StaffRole `json:"user_role"`
	Position string    `json:"position,omitempty"`
}

const testSecret = "test-secret-key"

func makeToken(t *testing.T, claims testClaims, secret string) string {
	t.Helper()
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("makeToken: %v", err)
	}
	return tok
}

func TestParseToken(t *testing.T) {
	tenantID := int64(1)

	tests := []struct {
		name      string
		token     func() string
		wantErr   error
		wantRole  StaffRole
		wantTenID int64
	}{
		{
			name: "valid token",
			token: func() string {
				return makeToken(t, testClaims{
					RegisteredClaims: jwt.RegisteredClaims{
						ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
					},
					TenantID: tenantID,
					UserRole: RoleOwner,
				}, testSecret)
			},
			wantTenID: 1,
			wantRole:  RoleOwner,
		},
		{
			name: "wrong secret",
			token: func() string {
				return makeToken(t, testClaims{
					RegisteredClaims: jwt.RegisteredClaims{
						ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
					},
					TenantID: tenantID,
					UserRole: RoleOwner,
				}, "wrong-secret")
			},
			wantErr: ErrTokenInvalid,
		},
		{
			name: "expired token",
			token: func() string {
				return makeToken(t, testClaims{
					RegisteredClaims: jwt.RegisteredClaims{
						ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
					},
					TenantID: tenantID,
					UserRole: RoleOwner,
				}, testSecret)
			},
			wantErr: ErrTokenInvalid,
		},
		{
			name: "missing tenant_id",
			token: func() string {
				return makeToken(t, testClaims{
					RegisteredClaims: jwt.RegisteredClaims{
						ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
					},
					TenantID: 0,
					UserRole: RoleOwner,
				}, testSecret)
			},
			wantErr: ErrClaimsMissing,
		},
		{
			name:    "empty token string",
			token:   func() string { return "" },
			wantErr: ErrTokenMissing,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			claims, err := ParseToken(tc.token(), testSecret)
			if tc.wantErr != nil {
				if err == nil {
					t.Fatalf("expected error wrapping %v, got nil", tc.wantErr)
				}
				// ErrTokenMissing and ErrClaimsMissing are returned directly (not wrapped)
				// ErrTokenInvalid is wrapped with fmt.Errorf("%w: %w", ...)
				// errors.Is handles both cases.
				if !isErr(err, tc.wantErr) {
					t.Fatalf("expected error wrapping %v, got: %v", tc.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if claims.TenantID != tc.wantTenID {
				t.Errorf("TenantID = %d, want %d", claims.TenantID, tc.wantTenID)
			}
			if claims.UserRole != tc.wantRole {
				t.Errorf("UserRole = %q, want %q", claims.UserRole, tc.wantRole)
			}
		})
	}
}

// isErr checks whether err matches target using direct equality or errors.Is.
func isErr(err, target error) bool {
	if err == target {
		return true
	}
	// unwrap chain
	type unwrapper interface{ Unwrap() []error }
	if u, ok := err.(unwrapper); ok {
		for _, e := range u.Unwrap() {
			if isErr(e, target) {
				return true
			}
		}
	}
	type unwrap1 interface{ Unwrap() error }
	if u, ok := err.(unwrap1); ok {
		return isErr(u.Unwrap(), target)
	}
	return false
}
