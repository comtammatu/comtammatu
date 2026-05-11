package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/personal/comtammatu/backend/internal/auth"
)

const testJWTSecret = "test-secret"

type testClaims struct {
	jwt.RegisteredClaims
	TenantID int64          `json:"tenant_id"`
	BranchID *int64         `json:"branch_id"`
	AreaID   *int64         `json:"area_id"`
	UserRole auth.StaffRole `json:"user_role"`
	Position string         `json:"position,omitempty"`
}

func TestRequireModule(t *testing.T) {
	tests := []struct {
		name       string
		role       auth.StaffRole
		module     auth.ModuleKey
		wantStatus int
	}{
		{
			name:       "owner can access staff",
			role:       auth.RoleOwner,
			module:     auth.ModuleStaff,
			wantStatus: http.StatusOK,
		},
		{
			name:       "cashier cannot access staff",
			role:       auth.RoleCashier,
			module:     auth.ModuleStaff,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "cashier cannot access menu",
			role:       auth.RoleCashier,
			module:     auth.ModuleMenu,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "branch manager can access menu",
			role:       auth.RoleBranchManager,
			module:     auth.ModuleMenu,
			wantStatus: http.StatusOK,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusOK)
			})
			handler := Authenticate(testJWTSecret)(RequireModule(tc.module)(next))

			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.Header.Set("Authorization", "Bearer "+signedToken(t, tc.role))
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
		})
	}
}

func TestRequireModuleRequiresAuthentication(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := RequireModule(auth.ModuleStaff)(next)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func signedToken(t *testing.T, role auth.StaffRole) string {
	t.Helper()

	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, testClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
		TenantID: 1,
		UserRole: role,
	}).SignedString([]byte(testJWTSecret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return token
}
